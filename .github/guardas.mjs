#!/usr/bin/env node
/* A GUARDA DO CONTEÚDO, NO CI (passo «Conferir o conteúdo» do prerender.yml;
 * não precisa de segredos). Molde: a guarda da AMMA Creative, que veio da da
 * LR Motors.
 *
 * Lê os cinco ficheiros de data/ e corre as regras de .github/regras.mjs — as
 * MESMAS que o painel (https://backoffice.pokeauto.pt) mostra por baixo dos
 * campos e que o Worker do painel confere antes de gravar. As regras dos
 * termos proibidos são as do termos.py, traduzidas uma a uma (o painel recusa
 * o texto antes de ele chegar aqui; o termos.py, no passo seguinte, continua a
 * ser a última palavra).
 *
 * O QUE ESTA GUARDA PODE E NÃO PODE FAZER. O GitHub Pages deste site serve o
 * ramo main tal e qual: um data/*.json gravado fica à vista em segundos (o
 * app.js desenha as secções a partir dele), antes de este workflow acabar. A
 * guarda não desfaz isso. O que ela pára é o resto da publicação — o HTML que
 * os motores de busca lêem, os dados estruturados, o cartão de partilha —
 * para nada disso congelar um ficheiro que não se pode publicar. A protecção a
 * sério é o painel, que não grava o que aqui pararia.
 *
 * Só pára o que não se pode publicar sem inventar um valor ou partir a página
 * (classe «bloqueia»: a forma dos ficheiros, a morada, o NIF, um contacto, uma
 * hora que o prerender.py não lê, um termo proibido). O resto vai para as
 * anotações e para o resumo da corrida, sem parar nada.
 *
 *   node .github/guardas.mjs [--raiz <pasta>] [--relatorio-em <ficheiro>]
 *       Confere. Sai com 1 só se houver um «bloqueia»; 2 se a chamada estiver
 *       errada.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FICHEIROS, ORDEM, ECRAS, problemas } from './regras.mjs';
import { umaLinha } from './consola.mjs';

const RAIZ_DO_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_ANOTACOES = 9;

/* ------------------------------------------------------------------ */
/* Ler o repositório                                                    */
/* ------------------------------------------------------------------ */

/* Os dados como o site os lê: o texto de cada um dos cinco ficheiros (null se
   não existe: as regras dizem «falta»). Um «.json» que não é um ficheiro
   normal (uma pasta, uma ligação) pára aqui, com o nome dele. */
export function lerDados(raiz) {
  const estrutura = [];
  const dados = {};
  for (const f of ORDEM) {
    const rel = FICHEIROS[f];
    let st = null;
    try { st = lstatSync(join(raiz, rel)); } catch { st = null; }
    if (st && !st.isFile()) {
      estrutura.push({ classe: 'bloqueia', chave: `${f}:ficheiro:estrutura`, ficheiro: rel, ecra: ECRAS[f],
        mensagem: `${rel} não é um ficheiro normal (é uma pasta ou uma ligação): o site não se consegue gerar assim. Só o Renato o pode corrigir.` });
      continue;
    }
    dados[f] = st ? readFileSync(join(raiz, rel), 'utf8') : null;
  }
  return { dados, estrutura };
}

/* Que ficheiros há no repositório (as fotografias), e o que está numa pasta
   (as variantes de uma fotografia), como o site os vê. */
export function existeEm(raiz) {
  return (c) => {
    const rel = String(c ?? '').replace(/^\/+/, '');
    if (!rel || rel.split('/').includes('..')) return false;
    try { return lstatSync(join(raiz, rel)).isFile(); } catch { return false; }
  };
}
export function listarPastaEm(raiz) {
  const lidas = new Map();
  return (pasta) => {
    if (!lidas.has(pasta)) {
      let nomes = [];
      try { nomes = readdirSync(join(raiz, pasta)); } catch { nomes = []; }
      lidas.set(pasta, nomes);
    }
    return lidas.get(pasta);
  };
}

const ORDEM_CLASSES = { bloqueia: 0, neutraliza: 1, avisa: 2 };
export const ordenar = (lista) => lista.sort((a, b) => ORDEM_CLASSES[a.classe] - ORDEM_CLASSES[b.classe] || (a.lembrete ? 1 : 0) - (b.lembrete ? 1 : 0));

export function conferir(raiz, { hoje } = {}) {
  const { dados, estrutura } = lerDados(raiz);
  const lista = ordenar([...estrutura, ...problemas(dados, { existe: existeEm(raiz), listarPasta: listarPastaEm(raiz), ...(hoje ? { hoje } : {}) })]);
  return { dados, lista };
}

/* ------------------------------------------------------------------ */
/* As saídas                                                            */
/* ------------------------------------------------------------------ */

/* Os comandos do GitHub: %, \r e \n escapam-se na mensagem; nas
   propriedades, também : e ,. E o «##[» leva um espaço no meio, como no
   umaLinha(): numa linha de comando do formato novo o runner não o lê, mas
   assim nenhuma linha da guarda o tem. */
const escMsg = (s) => String(s).replace(/##\[/g, '## [').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escMsg(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function anotacoes(lista) {
  const linhas = [];
  const grupos = [
    ['error', lista.filter((p) => p.classe === 'bloqueia')],
    ['warning', lista.filter((p) => p.classe !== 'bloqueia' && !p.lembrete)],
    ['notice', lista.filter((p) => p.lembrete)],
  ];
  for (const [tipo, grupo] of grupos) {
    for (const p of grupo.slice(0, MAX_ANOTACOES)) {
      const prefixo = p.classe === 'neutraliza' ? 'Não aparece no site: ' : p.lembrete ? 'Lembrete: ' : '';
      linhas.push(`::${tipo} file=${escProp(p.ficheiro || '')},title=${escProp(p.ecra || 'Guarda do conteúdo')}::${escMsg(prefixo + p.mensagem)}`);
    }
    if (grupo.length > MAX_ANOTACOES) {
      linhas.push(`::${tipo} title=Guarda do conteúdo::${escMsg(`e mais ${grupo.length - MAX_ANOTACOES} — veja o resumo desta corrida`)}`);
    }
  }
  return linhas;
}

/* UM VALOR DOS DADOS NO RESUMO DA CORRIDA, que é público e que o GitHub lê em
   Markdown: entre crases (dentro de um código o GitHub não interpreta nada),
   com a cerca mais comprida do que a maior fila de crases do texto; numa
   tabela, a barra como «\|»; o controlo e as mudanças de linha passam a espaço. */
const emCodigo = (s, { tabela = false } = {}) => {
  let t = String(s ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ');
  if (tabela) t = t.replace(/\|/g, '\\|');
  const cerca = '`'.repeat((t.match(/`+/g) || []).reduce((m, x) => Math.max(m, x.length), 0) + 1);
  return `${cerca} ${t} ${cerca}`;
};
const MAX_RESUMO = 900 * 1024;
const contas = (lista) => ({
  bloqueia: lista.filter((p) => p.classe === 'bloqueia').length,
  neutraliza: lista.filter((p) => p.classe === 'neutraliza').length,
  avisa: lista.filter((p) => p.classe === 'avisa' && !p.lembrete).length,
  lembretes: lista.filter((p) => p.lembrete).length,
});

export function resumo(lista) {
  const n = contas(lista);
  const l = ['## Guarda do conteúdo', ''];
  if (n.bloqueia) l.push(`**A publicação parou**: ${n.bloqueia} problema(s) que não se podem contornar. O HTML para os motores de busca e o cartão de partilha ficam como estavam; corrige-se no painel.`);
  else l.push('A publicação segue.');
  l.push('', `Problemas: ${n.bloqueia} que param · ${n.neutraliza} que não aparecem no site · ${n.avisa} avisos · ${n.lembretes} lembretes.`);
  if (lista.length) {
    l.push('', '| | Onde se corrige | O quê |', '|---|---|---|');
    const nome = (p) => (p.classe === 'bloqueia' ? 'PÁRA' : p.classe === 'neutraliza' ? 'fora do site' : p.lembrete ? 'lembrete' : 'aviso');
    for (const p of lista) l.push(`| ${nome(p)} | ${emCodigo(p.ecra, { tabela: true })} | ${emCodigo(p.mensagem, { tabela: true })} |`);
  }
  const bytes = (s) => new TextEncoder().encode(s).length;
  if (bytes(`${l.join('\n')}\n`) <= MAX_RESUMO) return `${l.join('\n')}\n`;
  const cabem = []; let n2 = 0;
  for (const linha of l) { n2 += bytes(`${linha}\n`); if (n2 > MAX_RESUMO / 2) break; cabem.push(linha); }
  return `${cabem.join('\n')}\n\n… (o resto está no relatório desta corrida)\n`;
}

export function relatorio(lista) {
  return { versao: 1, ...contas(lista), problemas: lista };
}

const NOME_NA_CONSOLA = (p) => (p.classe === 'bloqueia' ? 'PÁRA        ' : p.classe === 'neutraliza' ? 'FORA DO SITE' : p.lembrete ? 'LEMBRETE    ' : 'AVISO       ');
/* A listagem leva os dados tal e qual, por isso cada linha passa pelo
   umaLinha(): o runner lê comandos no que aqui se escreve — ver consola.mjs. */
const listar = (texto) => console.log(umaLinha(texto));

function escreverSaidas(lista, relatorioEm) {
  for (const linha of anotacoes(lista)) console.log(linha);
  console.log('');
  for (const p of lista) listar(`  ${NOME_NA_CONSOLA(p)} ${p.ecra} — ${p.mensagem}`);
  const n = contas(lista);
  console.log(`\nGuarda do conteúdo: ${n.bloqueia} que param, ${n.neutraliza} que não aparecem no site, ${n.avisa} avisos, ${n.lembretes} lembretes.`);
  if (relatorioEm) writeFileSync(relatorioEm, JSON.stringify(relatorio(lista), null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo(lista));
  return n.bloqueia;
}

export function principal(args) {
  const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
  for (const nome of ['--raiz', '--relatorio-em']) {
    if (args.includes(nome) && !opcao(nome)) { console.error(`${nome} precisa de um valor`); return 2; }
  }
  const raiz = resolve(opcao('--raiz') || RAIZ_DO_REPOSITORIO);
  if (!existsSync(raiz)) { console.error(`a pasta ${raiz} não existe`); return 2; }
  const { lista } = conferir(raiz);
  return escreverSaidas(lista, opcao('--relatorio-em')) ? 1 : 0;
}

/* Corre quando é o ficheiro chamado. O caminho REAL, dos dois lados: no Mac o
   /tmp e as pastas temporárias são ligações para /private/..., e o Node dá o
   import.meta.url já resolvido — com o caminho tal e qual, numa cópia em /tmp
   esta guarda não corria e saía com 0, calada. */
const chamado = () => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } };
if (process.argv[1] && chamado()) {
  process.exitCode = principal(process.argv.slice(2));
}
