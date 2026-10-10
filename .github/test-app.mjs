#!/usr/bin/env node
/* O app.js NO BROWSER DE QUEM VISITA: os títulos das secções.
 *
 * Corre em local, NÃO no CI (como a .github/test-guardas.mjs):
 *
 *     node .github/test-app.mjs
 *
 * O app.js é um script do browser, sem módulos: tira-se dele a função
 * aplicarHead e os TITULOS_POR_OMISSAO (pelo texto) e corre-se com um DOM
 * de faz-de-conta — o que ela faz é só textContent e hidden.
 *
 * O que prova:
 *   · um texto apagado dos títulos de uma secção sai do site: a etiqueta e o
 *     subtítulo vazios escondem-se (antes ficava o texto que lá estava), e
 *     voltam quando se escrevem; o título vazio passa a ser o nome da secção
 *     no menu; um head que não chegou (o ficheiro não abriu) não mexe em nada;
 *   · os títulos por omissão são os mesmos no app.js, no prerender.py (o HTML
 *     congelado) e nas regras do painel (.github/regras.mjs). */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './regras.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let falhas = 0; let certas = 0;
const certo = (cond, msg, extra = '') => { if (cond) certas++; else { falhas++; console.log(`  ✗ ${msg}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); } };
const parte = (t) => console.log(`\n${t}`);

const app = readFileSync(join(RAIZ, 'assets/js/app.js'), 'utf8');
const fonteFn = /\n {2}function aplicarHead\(escopo, head\) \{\n[\s\S]*?\n {2}\}\n/.exec(app)?.[0] ?? null;
const fonteTitulos = /\n {2}var TITULOS_POR_OMISSAO = \{[^}]*\};\n/.exec(app)?.[0] ?? null;

parte('o app.js: os títulos das secções');
certo(Boolean(fonteFn), 'o app.js tem a função aplicarHead');
certo(Boolean(fonteTitulos), 'e os TITULOS_POR_OMISSAO, ao pé dela');
if (!fonteFn) { console.log(`\nFALHOU: ${falhas} de ${falhas + certas}`); process.exit(1); }
const { aplicarHead, TITULOS } = new Function(`${fonteTitulos ?? 'var TITULOS_POR_OMISSAO = {};'}${fonteFn}\nreturn { aplicarHead: aplicarHead, TITULOS: TITULOS_POR_OMISSAO };`)();

/* Uma secção do index.html, com os três elementos do cabeçalho. */
function seccao(id, { etiqueta = 'Etiqueta de antes', titulo = 'Título de antes', lead = 'Subtítulo de antes', semLead = false } = {}) {
  const no = (t) => ({ textContent: t, hidden: false });
  const partes = { '.etiqueta': no(etiqueta), '.h-sec': no(titulo), ...(semLead ? {} : { '.lead': no(lead) }) };
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
