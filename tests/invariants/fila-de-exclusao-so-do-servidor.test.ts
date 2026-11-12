/**
 * A FILA DE EXCLUSÃO DE ARQUIVOS É DO SERVIDOR (issue #267).
 *
 * Cada linha de `storage_redaction_queue` é uma ordem — "apague este caminho
 * deste bucket" — cumprida pelo worker com a credencial de serviço. Este
 * arquivo mede as duas metades da regra, no banco e no worker de verdade:
 *
 *   1. quem pode escrever a ordem: nenhum papel de sessão (`anon`,
 *      `authenticated`) tem privilégio sobre a tabela. O controle é o
 *      `service_role`, que continua tendo — sem ele o caso passaria num banco
 *      onde a tabela nem existisse;
 *
 *   2. o que a ordem pode alcançar: o worker só executa linha que aponta para
 *      um bucket conhecido e para dentro da pasta da organização da própria
 *      linha. O caminho de uma linha é copiado de colunas de outras tabelas;
 *      o worker não apaga pela palavra de quem as escreveu.
 *
 * Dublê, só o bucket (`storage-em-memoria.ts`), como nos outros invariantes
 * do worker.
 */
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { storageEmMemoria } from "../support/storage-em-memoria";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 1,
});

const quem = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => quem.db }));

import { drainStorageRedactionQueue } from "@/lib/lgpd/storage-redaction-queue";

const ORG = "26700000-0000-4000-8000-000000000001";
const VIZINHA = "26700000-0000-4000-8000-000000000002";
const CONVERSA = "26700000-0000-4000-8000-000000000005";

const DA_ORG = `${ORG}/${CONVERSA}/da-org.jpg`;
const DA_VIZINHA = `${VIZINHA}/${CONVERSA}/da-vizinha.jpg`;

const storage = storageEmMemoria();
const existe = (bucket: string, p: string) => storage.objetos.has(`${bucket}/${p}`);

async function guardar(bucket: string, p: string): Promise<void> {
  await storage.from(bucket).upload(p, new Uint8Array([0xff, 0xd8, 0xff]), {
    contentType: "image/jpeg",
    upsert: true,
  });
}

async function enfileirar(org: string, bucket: string, p: string): Promise<void> {
  await pool.query(
    `insert into storage_redaction_queue (organization_id, bucket, object_path) values ($1, $2, $3)`,
    [org, bucket, p],
  );
}

async function linha(bucket: string, p: string) {
  const { rows } = await pool.query(
    `select status, error_message, attempts from storage_redaction_queue
      where bucket = $1 and object_path = $2`,
    [bucket, p],
  );
  return rows[0] as { status: string; error_message: string | null; attempts: number };
}

async function privilegio(papel: string, qual: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select has_table_privilege($1, 'public.storage_redaction_queue', $2) as tem`,
    [papel, qual],
  );
  return rows[0].tem as boolean;
}

beforeAll(async () => {
  quem.db = Object.assign(pgComoSupabase(pool), { storage });
  for (const [id, n] of [
    [ORG, 1],
    [VIZINHA, 2],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name)
       values ($1, $2, $3, $4) on conflict (id) do nothing`,
      [id, `org-fila-267-${n}`, `Org Fila 267-${n} LTDA`, `Org Fila 267-${n}`],
    );
  }
});

beforeEach(async () => {
  storage.objetos.clear();
  storage.aoRemover(null);
  // O worker drena a fila INTEIRA; as contagens só medem este arquivo se ela
  // começar com o que ele enfileira.
  await pool.query(`delete from storage_redaction_queue`);
});

afterAll(async () => {
  await pool.query(`delete from storage_redaction_queue where organization_id in ($1, $2)`, [
    ORG,
    VIZINHA,
  ]);
  await pool.end();
});

describe("quem pode escrever uma ordem de exclusão", () => {
  it.each(["anon", "authenticated"])("%s não tem privilégio nenhum sobre a fila", async (papel) => {
    for (const qual of ["select", "insert", "update", "delete", "truncate"]) {
      expect(await privilegio(papel, qual), `${papel} com ${qual}`).toBe(false);
    }
  });

  it("CONTROLE: o servidor continua lendo e escrevendo", async () => {
    for (const qual of ["select", "insert", "update", "delete"]) {
      expect(await privilegio("service_role", qual), `service_role sem ${qual}`).toBe(true);
    }
  });

  it("a RLS da tabela continua ligada", async () => {
    const { rows } = await pool.query(
      `select relrowsecurity from pg_class where oid = 'public.storage_redaction_queue'::regclass`,
    );
    expect(rows[0].relrowsecurity).toBe(true);
  });
});

describe("o que uma ordem de exclusão pode alcançar", () => {
  it("CONTROLE: linha da organização, na pasta dela, é executada", async () => {
    await guardar("whatsapp-media", DA_ORG);
    await enfileirar(ORG, "whatsapp-media", DA_ORG);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(existe("whatsapp-media", DA_ORG)).toBe(false);
    expect((await linha("whatsapp-media", DA_ORG)).status).toBe("deleted");
    expect(stats).toEqual({ attempted: 1, deleted: 1, failed: 0, skipped: 0 });
  });

  it("linha de uma organização apontando para a pasta de outra: o arquivo fica", async () => {
    await guardar("whatsapp-media", DA_VIZINHA);
    await enfileirar(ORG, "whatsapp-media", DA_VIZINHA);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(existe("whatsapp-media", DA_VIZINHA)).toBe(true);
    expect(await linha("whatsapp-media", DA_VIZINHA)).toMatchObject({
      status: "skipped",
      error_message: "fora_da_pasta_da_organizacao",
    });
    expect(stats).toEqual({ attempted: 1, deleted: 0, failed: 0, skipped: 1 });
  });

  it.each([
    ["subida de pasta", `${ORG}/../${VIZINHA}/${CONVERSA}/da-vizinha.jpg`],
    ["segmento vazio", `${ORG}//da-org.jpg`],
    ["só a pasta da organização", `${ORG}`],
    ["a pasta da organização com barra no fim", `${ORG}/`],
    ["prefixo que só parece o da organização", `${ORG}x/arquivo.jpg`],
    ["arquivo solto na raiz do bucket", "logo-da-instalacao.png"],
    ["barra invertida", `${ORG}/pasta\\..\\x.jpg`],
  ])("caminho com %s: nada é removido", async (_nome, caminho) => {
    await guardar("whatsapp-media", caminho);
    await enfileirar(ORG, "whatsapp-media", caminho);

    await drainStorageRedactionQueue({ limit: 10 });

    expect(existe("whatsapp-media", caminho)).toBe(true);
    expect(await linha("whatsapp-media", caminho)).toMatchObject({
      status: "skipped",
      error_message: "fora_da_pasta_da_organizacao",
    });
  });

  it("bucket que não passa por esta fila: nada é removido, mesmo na pasta da organização", async () => {
    const caminho = `${ORG}/logo.png`;
    await guardar("brand-logos", caminho);
    await enfileirar(ORG, "brand-logos", caminho);

    await drainStorageRedactionQueue({ limit: 10 });

    expect(existe("brand-logos", caminho)).toBe(true);
    expect(await linha("brand-logos", caminho)).toMatchObject({
      status: "skipped",
      error_message: "bucket_fora_da_lista",
    });
  });

  it.each(["internal-media", "propostas"])("CONTROLE: %s segue passando pela fila", async (bucket) => {
    const caminho = `${ORG}/arquivo-de-${bucket}.pdf`;
    await guardar(bucket, caminho);
    await enfileirar(ORG, bucket, caminho);

    await drainStorageRedactionQueue({ limit: 10 });

    expect(existe(bucket, caminho)).toBe(false);
    expect((await linha(bucket, caminho)).status).toBe("deleted");
  });

  it("a recusa é terminal: a rodada seguinte não tenta de novo", async () => {
    await guardar("whatsapp-media", DA_VIZINHA);
    await enfileirar(ORG, "whatsapp-media", DA_VIZINHA);

    await drainStorageRedactionQueue({ limit: 10 });
    const segunda = await drainStorageRedactionQueue({ limit: 10 });

    expect(segunda.attempted).toBe(0);
    expect(existe("whatsapp-media", DA_VIZINHA)).toBe(true);
  });

  it("uma linha recusada não segura as outras do lote", async () => {
    await guardar("whatsapp-media", DA_VIZINHA);
    await guardar("whatsapp-media", DA_ORG);
    await enfileirar(ORG, "whatsapp-media", DA_VIZINHA);
    await enfileirar(ORG, "whatsapp-media", DA_ORG);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(existe("whatsapp-media", DA_VIZINHA)).toBe(true);
    expect(existe("whatsapp-media", DA_ORG)).toBe(false);
    expect(stats).toEqual({ attempted: 2, deleted: 1, failed: 0, skipped: 1 });
  });
});
