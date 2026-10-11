#!/usr/bin/env node
/* O app.js NO BROWSER DE QUEM VISITA: os textos que o dono escreve, e os
 * títulos das secções.
 *
 * Corre em local, NÃO no CI (como a .github/test-guardas.mjs):
 *
 *     node .github/test-app.mjs
 *
 * O app.js é um script do browser, sem módulos: tira-se dele (pelo texto) a
 * função aplicarTexto, a aplicarHead e os TITULOS_POR_OMISSAO, e corre-se com
 * um DOM de faz-de-conta — o que elas fazem é só textContent e hidden. Precisa
 * de um python3 (PYTHON=<outro> para escolher) para comparar com o
 * prerender.py. O index.html confere-se pelo texto.
 *
 * O que prova:
 *   · um texto que o dono apaga sai do site: vazio — ou só espaços, ou sem a
 *     chave — o nó fica vazio e escondido, e volta quando se escreve
 *     (aplicarTexto: os [data-site] do topo, e a etiqueta e o subtítulo das
 *     secções);
 *   · o app.js e o prerender.py dizem o mesmo, caso a caso: o que se vê com
 *     JavaScript e o que fica no HTML congelado (o aplicar_site);
 *   · os títulos das secções: a etiqueta e o subtítulo vazios escondem-se, o
 *     título vazio passa a ser o nome da secção no menu; um head que não
 *     chegou (o ficheiro não abriu) não mexe em nada;
 *   · os títulos por omissão são os mesmos no app.js, no prerender.py (o HTML
 *     congelado) e nas regras do painel (.github/regras.mjs). */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as R from './regras.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
let falhas = 0; let certas = 0;
const certo = (cond, msg, extra = '') => { if (cond) certas++; else { falhas++; console.log(`  ✗ ${msg}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); } };
const parte = (t) => console.log(`\n${t}`);

const app = readFileSync(join(RAIZ, 'assets/js/app.js'), 'utf8');
/* A função de um texto. Num app.js de antes dela, a regra estava escrita no
   ciclo dos [data-site]: tira-se de lá, para provar o que ela fazia. */
let fonteTexto = /\n {2}function aplicarTexto\(n, v\) \{\n[\s\S]*?\n {2}\}\n/.exec(app)?.[0] ?? null;
const temAplicarTexto = Boolean(fonteTexto);
if (!fonteTexto) {
  const corpo = /doc\.querySelectorAll\('\[data-site\]'\)\.forEach\(function \(n\) \{\n\s*var v = val\(n\.getAttribute\('data-site'\)\);\n([\s\S]*?)\n\s*\}\);/.exec(app)?.[1];
  fonteTexto = corpo ? `\nfunction aplicarTexto(n, v) {\n${corpo}\n}\n` : '\nfunction aplicarTexto(n, v) { throw new Error("sem regra"); }\n';
}
const fonteFn = /\n {2}function aplicarHead\(escopo, head\) \{\n[\s\S]*?\n {2}\}\n/.exec(app)?.[0] ?? null;
const fonteTitulos = /\n {2}var TITULOS_POR_OMISSAO = \{[^}]*\};\n/.exec(app)?.[0] ?? null;

parte('o app.js: um texto que o dono apaga sai do site');
certo(temAplicarTexto, 'o app.js tem a função aplicarTexto (uma regra só, para os [data-site] e para os cabeçalhos)');
const { aplicarTexto } = new Function(`${fonteTexto}\nreturn { aplicarTexto: aplicarTexto };`)();
/* Um nó como os do browser: o textContent guarda sempre texto (0 passa a «0»). */
const no = (t = 'antigo') => { let x = String(t); return { get textContent() { return x; }, set textContent(v) { x = String(v); }, hidden: false }; };
/* Os casos, e o que se deve ver: [o valor, se a chave nem existe] → { escondido, texto } */
const CASOS = [
  { nome: 'sem a chave', ausente: true, deve: { escondido: true, texto: '' } },
  { nome: 'null', valor: null, deve: { escondido: true, texto: '' } },
  { nome: 'vazio', valor: '', deve: { escondido: true, texto: '' } },
  { nome: 'só espaços', valor: '   ', deve: { escondido: true, texto: '' } },
  { nome: 'com texto', valor: 'Texto novo', deve: { escondido: false, texto: 'Texto novo' } },
  { nome: 'com < e &', valor: 'Lavagem & cera < 20€', deve: { escondido: false, texto: 'Lavagem & cera < 20€' } },
  { nome: 'um número', valor: 0, deve: { escondido: false, texto: '0' } },
];
const doApp = CASOS.map((c) => { const n = no(); try { aplicarTexto(n, c.ausente ? undefined : c.valor); } catch { return null; } return { escondido: n.hidden, texto: n.textContent }; });
CASOS.forEach((c, i) => certo(JSON.stringify(doApp[i]) === JSON.stringify(c.deve), `${c.nome}: ${c.deve.escondido ? 'escondido e vazio' : `aparece «${c.deve.texto}»`}`, doApp[i]));
{
  const n = no(); aplicarTexto(n, ''); aplicarTexto(n, 'Voltou.');
  certo(n.hidden === false && n.textContent === 'Voltou.', 'apagado e escrito outra vez: volta a aparecer');
}

parte('o app.js e o prerender.py dizem o mesmo (o ecrã e o HTML congelado)');
{
  const py = [
    'import html, json, re, sys',
    `sys.path.insert(0, ${JSON.stringify(join(RAIZ, '.github', 'scripts'))})`,
    'import prerender',
    'out = []',
    'for c in json.loads(sys.stdin.read()):',
    '    hero = {} if c.get("ausente") else {"x": c.get("valor")}',
    '    novo, _ = prerender.aplicar_site(\'<p data-site="hero.x">antigo</p>\', {"hero": hero, "contactos": {}})',
    '    m = re.match(r\'^<p data-site="hero\\.x"( hidden)?>(.*)</p>$\', novo, re.S)',
    '    out.append({"escondido": bool(m and m.group(1)), "texto": html.unescape(m.group(2)) if m else novo})',
    'print(json.dumps(out, ensure_ascii=False))',
  ].join('\n');
  let doPy = null;
  try { doPy = JSON.parse(execFileSync(PYTHON, ['-c', py], { input: JSON.stringify(CASOS), encoding: 'utf8' })); } catch (e) { console.log(`  (o python não correu: ${String(e.message).split('\n')[0]})`); }
  if (!doPy) certo(false, 'a comparação com o prerender.py precisa de um python3');
  else {
    const diferentes = CASOS.filter((c, i) => JSON.stringify(doPy[i]) !== JSON.stringify(doApp[i])).map((c, i) => c.nome);
    certo(diferentes.length === 0, `em ${CASOS.length} casos, o HTML congelado (aplicar_site) é o que o app.js mostra`, CASOS.map((c, i) => `${c.nome}: py ${JSON.stringify(doPy[i])} app ${JSON.stringify(doApp[i])}`).filter((_, i) => JSON.stringify(doPy[i]) !== JSON.stringify(doApp[i])).join(' | '));
  }
}

parte('o app.js: os títulos das secções');
certo(Boolean(fonteFn), 'o app.js tem a função aplicarHead');
certo(Boolean(fonteTitulos), 'e os TITULOS_POR_OMISSAO, ao pé dela');
if (!fonteFn) { console.log(`\nFALHOU: ${falhas} de ${falhas + certas}`); process.exit(1); }
const { aplicarHead, TITULOS } = new Function(`${fonteTexto}${fonteTitulos ?? 'var TITULOS_POR_OMISSAO = {};'}${fonteFn}\nreturn { aplicarHead: aplicarHead, TITULOS: TITULOS_POR_OMISSAO };`)();

/* Uma secção do index.html, com os três elementos do cabeçalho. */
function seccao(id, { etiqueta = 'Etiqueta de antes', titulo = 'Título de antes', lead = 'Subtítulo de antes', semLead = false } = {}) {
  const n = (t) => no(t);
  const partes = { '.etiqueta': n(etiqueta), '.h-sec': n(titulo), ...(semLead ? {} : { '.lead': n(lead) }) };
  return { id, partes, querySelector: (s) => partes[s] ?? null };
}
const ver = (s) => Object.fromEntries(Object.entries(s.partes).map(([k, n]) => [k, n.hidden ? '(escondido)' : n.textContent]));

{
  const s = seccao('servicos');
  aplicarHead(s, { etiqueta: '', titulo: '', lead: '' });
  const v = ver(s);
  certo(v['.etiqueta'] === '(escondido)' && s.partes['.etiqueta'].textContent === '', 'a etiqueta apagada esconde-se, vazia (antes ficava a de antes)', v);
  certo(v['.lead'] === '(escondido)' && s.partes['.lead'].textContent === '', 'o subtítulo apagado esconde-se, vazio', v);
  certo(v['.h-sec'] === 'Serviços', 'o título apagado passa a ser o nome da secção no menu («Serviços»)', v);
  aplicarHead(s, { etiqueta: 'O que fazemos', titulo: 'Serviços da oficina', lead: 'Voltou.' });
  const w = ver(s);
  certo(w['.etiqueta'] === 'O que fazemos' && w['.lead'] === 'Voltou.' && w['.h-sec'] === 'Serviços da oficina', 'escritos outra vez, voltam a aparecer', w);
}
{
  const s = seccao('lavagens');
  aplicarHead(s, { titulo: 'Preços' });
  const v = ver(s);
  certo(v['.etiqueta'] === '(escondido)' && v['.lead'] === '(escondido)' && v['.h-sec'] === 'Preços', 'um head sem a etiqueta nem o subtítulo (as chaves nem existem): saem como se estivessem vazios', v);
}
{
  const s = seccao('promocoes', { semLead: true });
  aplicarHead(s, { etiqueta: 'A decorrer', titulo: '   ', lead: 'sem sítio onde aparecer' });
  const v = ver(s);
  certo(v['.h-sec'] === 'Promoções' && v['.etiqueta'] === 'A decorrer', 'nas promoções (que só o app.js desenha): o título só com espaços passa a «Promoções»', v);
}
{
  const s = seccao('contactos');
  const antes = JSON.stringify(ver(s));
  aplicarHead(s, undefined);
  aplicarHead(s, null);
  certo(JSON.stringify(ver(s)) === antes, 'um head que não chegou (o ficheiro não abriu) não mexe em nada');
  aplicarHead(s, { etiqueta: 'Onde estamos', titulo: 'Na Rua da Liberdade, 53', lead: 'Na zona pedonal.' });
  const v = ver(s);
  certo(v['.etiqueta'] === 'Onde estamos' && v['.h-sec'] === 'Na Rua da Liberdade, 53' && v['.lead'] === 'Na zona pedonal.', 'com os textos preenchidos, escreve-os tal e qual', v);
}

parte('os títulos por omissão: o app.js, o prerender.py e as regras do painel dizem o mesmo');
{
  const py = readFileSync(join(RAIZ, '.github/scripts/prerender.py'), 'utf8');
  const doPy = /^TITULO_POR_OMISSAO = (\{[^}]*\})$/m.exec(py)?.[1] ?? null;
  const prerender = doPy ? JSON.parse(doPy.replace(/'/g, '"')) : null;
  certo(JSON.stringify(TITULOS) === JSON.stringify({ servicos: 'Serviços', promocoes: 'Promoções', lavagens: 'Lavagens', contactos: 'Contactos' }),
    'o app.js: Serviços, Promoções, Lavagens e Contactos (os nomes do menu)', TITULOS);
  certo(prerender && Object.entries(prerender).every(([k, v]) => TITULOS[k] === v) && Object.keys(prerender).sort().join() === 'contactos,lavagens,servicos',
    'o prerender.py tem os mesmos para as três secções que congela', prerender);
  certo(JSON.stringify(R.TITULOS_POR_OMISSAO ?? null) === JSON.stringify(TITULOS), 'e as regras do painel também (é o que a mensagem de um título vazio diz)', R.TITULOS_POR_OMISSAO ?? null);
}

console.log(`\n${falhas ? `FALHOU: ${falhas} de ${falhas + certas}` : `tudo certo: ${certas} afirmações`}`);
process.exitCode = falhas ? 1 : 0;
