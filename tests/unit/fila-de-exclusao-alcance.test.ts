import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BUCKETS_DA_FILA, foraDoAlcance } from "@/lib/lgpd/storage-redaction-queue";

/**
 * A regra pura do que uma linha da fila de exclusão pode alcançar (#267). O
 * comportamento do worker contra o banco está em
 * `tests/invariants/fila-de-exclusao-so-do-servidor.test.ts`; aqui fica a
 * tabela, que roda sem banco.
 */
const ORG = "267000aa-0000-4000-8000-000000000001";
const OUTRA = "267000aa-0000-4000-8000-000000000002";
const linha = (object_path: string, bucket = "whatsapp-media") => ({
  organization_id: ORG,
  bucket,
  object_path,
});

describe("foraDoAlcance", () => {
  it.each([
    `${ORG}/conversa/mensagem.jpg`,
    `${ORG}/avatars/contato.jpg`,
    `${ORG}/templates/cabecalho.png`,
    `${ORG}/proposta.pdf`,
    `${ORG}/a/b/c/d.bin`,
  ])("aceita %s", (caminho) => {
    expect(foraDoAlcance(linha(caminho))).toBeNull();
  });

  it.each([
    `${OUTRA}/conversa/mensagem.jpg`,
    `${ORG}/../${OUTRA}/x.jpg`,
    `${ORG}/./x.jpg`,
    `${ORG}//x.jpg`,
    `${ORG}/x.jpg/`,
    `${ORG}`,
    `${ORG}/`,
    `${ORG}x/y.jpg`,
    `/${ORG}/x.jpg`,
    `x/${ORG}/y.jpg`,
    `${ORG.toUpperCase()}/x.jpg`,
    `${ORG}/pasta\\x.jpg`,
    "arquivo.png",
    "",
  ])("recusa %j por estar fora da pasta da organização", (caminho) => {
    expect(foraDoAlcance(linha(caminho))).toBe("fora_da_pasta_da_organizacao");
  });

  it.each(["brand-logos", "ai-policy", "lgpd-exports", "", "WHATSAPP-MEDIA", "whatsapp-media/"])(
    "recusa o bucket %j",
    (bucket) => {
      expect(foraDoAlcance(linha(`${ORG}/x.jpg`, bucket))).toBe("bucket_fora_da_lista");
    },
  );

  it("a lista de buckets é a dos que o banco e o app enfileiram", () => {
    // As fontes: as funções do baseline (bucket literal ao lado do insert na
    // fila) e os dois pontos do app. Bucket novo enfileirado sem entrar na
    // lista faria o worker recusar exclusão legítima — este caso reprova antes.
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    const doBanco = new Set(
      [
        ...baseline.matchAll(
          /insert into (?:public\.)?storage_redaction_queue \(organization_id(?:, request_id)?, bucket, object_path\)\s+(?:--[^\n]*\n\s*)*select [^,]+,(?: [^,]+,)? '([a-z-]+)'/g,
        ),
      ].map((m) => m[1]!),
    );
    expect(doBanco.size, "a sonda não achou nenhum bucket no baseline").toBeGreaterThan(0);

    const doApp = new Set<string>();
    for (const arquivo of ["lib/lgpd/redact-cascade.ts", "app/api/v1/cron/contact-avatars/route.ts"]) {
      for (const m of readFileSync(arquivo, "utf8").matchAll(/bucket: "([a-z-]+)"/g)) {
        doApp.add(m[1]!);
      }
    }
    expect(doApp.size, "a sonda não achou nenhum bucket no app").toBeGreaterThan(0);

    for (const bucket of [...doBanco, ...doApp]) {
      expect(BUCKETS_DA_FILA.has(bucket), `${bucket} é enfileirado e não está na lista`).toBe(true);
    }
  });
});
