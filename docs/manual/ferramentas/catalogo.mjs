/*
 * Lê os destinos do menu direto de `lib/navigation/catalogo.ts` — a única lista
 * de telas do app. O manual não guarda cópia dela: o que o catálogo declara é o
 * que o manual precisa cobrir, e o conferidor reprova quando falta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ_DO_REPO = path.resolve(aqui, '..', '..', '..');
const ARQUIVO = path.join(RAIZ_DO_REPO, 'lib', 'navigation', 'catalogo.ts');

const campo = (bloco, nome) => {
  const m = bloco.match(new RegExp('\\n    ' + nome + ':\\s*\\n?\\s*(["\'`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1'));
  return m ? m[2].replace(/\\(["'`])/g, '$1') : null;
};

export function lerCatalogo() {
  const fonte = fs.readFileSync(ARQUIVO, 'utf8');
  const grupos = lerGrupos(fonte);
  const inicio = fonte.indexOf('export const NAV_CATALOG');
  if (inicio < 0) throw new Error('NAV_CATALOG não encontrado em ' + ARQUIVO);
  const fim = fonte.indexOf('] as const', inicio);
  const corpo = fonte.slice(inicio, fim);
  const itens = [];
  for (const m of corpo.matchAll(/\n  \{\n([\s\S]*?)\n  \},?(?=\n)/g)) {
    const b = '\n' + m[1];
    const href = campo(b, 'href');
    if (!href) continue;
    const menu = b.match(/\n    menu:\s*\{([^}]*)\}/);
    const idGrupo = menu?.[1].match(/grupo:\s*"([^"]+)"/)?.[1];
    const g = grupos[idGrupo];
    if (!g) throw new Error(`${href}: grupo de menu "${idGrupo}" não existe em MENU_GRUPOS (lib/navigation/catalogo.ts)`);
    const label = campo(b, 'label');
    const partes = [ROTULO_DO_BLOCO[g.bloco], g.area ? ROTULO_DA_AREA[g.area] : null, g.label, label].filter(Boolean);
    itens.push({
      href,
      label,
      termo: menu[1].match(/termo:\s*"([^"]+)"/)?.[1] ?? null,
      descricao: campo(b, 'description'),
      grupo: capituloDoManual(g),
      secao: null,
      onde: partes.join(' › '),
      papel: campo(b, 'minRole') || 'viewer',
      modulo: campo(b, 'modulo'),
      capacidade: campo(b, 'capacidade'),
    });
  }
  return itens;
}

/* O menu novo (issue #183) não tem os capítulos do manual: cada tela mora num grupo por tarefa de um
 * bloco (Todo dia, Configurar › área, Resultados). Estes auxiliares leem esse modelo. */
function lerGrupos(fonte) {
  const inicio = fonte.indexOf('export const MENU_GRUPOS');
  const fim = fonte.indexOf('] as const', inicio);
  const grupos = {};
  const re = /\{\s*id:\s*"([^"]+)",\s*bloco:\s*"([^"]+)",(?:\s*area:\s*"([^"]+)",)?\s*label:\s*"([^"]+)"/g;
  for (const m of fonte.slice(inicio, fim).matchAll(re)) grupos[m[1]] = { id: m[1], bloco: m[2], area: m[3] || null, label: m[4] };
  return grupos;
}

const ROTULO_DO_BLOCO = { 'todo-dia': 'Todo dia', configurar: 'Configurar', resultados: 'Resultados', conta: 'Você' };
const ROTULO_DA_AREA = { vender: 'Vender', agente: 'Agente', conexoes: 'Conexões', empresa: 'Empresa' };

/** Capítulo do manual onde uma tela ainda sem página aparece como "em breve". */
function capituloDoManual(g) {
  if (g.bloco === 'todo-dia') return g.id === 'gestao-de-clientes' ? 'crm' : 'atendimento';
  if (g.bloco === 'resultados') return 'analise';
  if (g.bloco === 'conta') return 'organizacao';
  return { vender: 'crm', agente: 'ia', conexoes: 'canais', empresa: 'organizacao' }[g.area] ?? 'organizacao';
}

export const ROTULO_DO_PAPEL = {
  viewer: 'Somente leitura',
  agent: 'Atendente',
  manager: 'Gerente',
  admin: 'Administrador',
};

export const ROTULO_DO_GRUPO = {
  atendimento: 'Atendimento',
  crm: 'CRM',
  ia: 'Agente de IA',
  canais: 'Canais',
  analise: 'Análise',
  organizacao: 'Organização e configurações',
};
