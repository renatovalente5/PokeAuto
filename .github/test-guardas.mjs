#!/usr/bin/env node
/* A BATERIA DA GUARDA DO CONTEÚDO (do molde da AMMA Creative e da LR Motors).
 *
 * Corre em local, NÃO no CI: afirma coisas sobre os dados de HOJE, e uma
 * campanha mal preenchida não pode parar a publicação por causa de um teste.
 *
 *     node .github/test-guardas.mjs
 *
 * Precisa de um python3 (o do Mac serve; PYTHON=<outro> para escolher) para a
 * paridade dos termos proibidos com o termos.py. O repositório não se toca:
 * cada caso corre numa cópia dos dados numa pasta temporária.
 *
 * O que prova:
 *   · regras.mjs é ES module puro (corre no browser e no Worker do painel:
 *     nada de node:, process ou require);
 *   · os dados de hoje passam sem nada que pare e sem nada fora do site; cada
 *     ficheiro sai do serializar() byte a byte, com a sua terminação (é assim
 *     que o painel os grava: um «Gravar» não reescreve o ficheiro inteiro);
 *   · OS TERMOS PROIBIDOS: as regras do regras.mjs acham o mesmo que o
 *     termos.py — a mesma regra, no mesmo sítio — num corpus de centenas de
 *     textos (maiúsculas, acentos, fronteiras de palavra, espaços estranhos);
 *   · cada «bloqueia» que importa tem um caso, com a classe e o ecrã certos;
 *   · a guarda: 0 com os dados de hoje, 1 com um «bloqueia» (e a anotação
 *     ::error), 2 com uma chamada errada; numa cópia em /tmp corre na mesma
 *     (o caminho real); nenhum dado abre um comando do runner;
 *   · o prerender.yml: a guarda corre antes de tudo o que lê os dados, os
 *     `paths` do push incluem as regras e a guarda, e há workflow_dispatch (o
 *     «Publicar outra vez» do painel). */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import * as R from './regras.mjs';
import { conferir, anotacoes } from './guardas.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
let falhas = 0; let certas = 0;
const certo = (cond, msg) => { if (cond) certas++; else { falhas++; console.log(`  ✗ ${msg}`); } };
const parte = (t) => console.log(`\n${t}`);

/* ------------------------------------------------ 1. o módulo é puro -- */
parte('regras.mjs é ES module puro');
const fonte = readFileSync(join(RAIZ, '.github/regras.mjs'), 'utf8');
certo(!/\bfrom\s+['"]node:/.test(fonte) && !/\brequire\s*\(/.test(fonte) && !/\bprocess\./.test(fonte), 'regras.mjs não importa node:, nem usa require ou process');
certo(!/^\s*import\s/m.test(fonte), 'regras.mjs não importa nada (o painel copia-o sozinho)');

/* --------------------------------------------- 2. os dados de hoje -- */
parte('os dados de hoje');
const hoje = conferir(RAIZ);
const bloq = hoje.lista.filter((p) => p.classe === 'bloqueia');
const fora = hoje.lista.filter((p) => p.classe === 'neutraliza');
certo(!bloq.length, `nada pára a publicação (${bloq.map((p) => p.mensagem).join(' | ')})`);
certo(!fora.length, `nada fica fora do site (${fora.map((p) => p.mensagem).join(' | ')})`);
for (const f of R.ORDEM) {
  const t = readFileSync(join(RAIZ, R.FICHEIROS[f]), 'utf8');
  certo(R.serializar(JSON.parse(t), R.terminacaoDe(t)) === t, `${R.FICHEIROS[f]} sai do serializar() byte a byte`);
}
console.log(`  ${hoje.lista.length} problema(s) hoje, todos lembretes ou avisos: ${hoje.lista.map((p) => p.ecra).join(', ') || 'nenhum'}`);

/* ------------------------------------------- 2b. o dia de hoje em Lisboa -- */
parte('o dia de hoje em Lisboa, à mão, é o do Intl');
{
  const intl = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' });
  let n = 0; let mal = 0;
  for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2032, 0, 1); t += 15 * 60000) { n++; const d = new Date(t); if (R.hojeEmLisboa(d) !== intl.format(d)) mal++; }
  certo(mal === 0, `o hojeEmLisboa dá o dia do Intl em cada quarto de hora de 2024 a 2031 (${n} instantes, ${mal} diferentes)`);
}

/* ---------------------------------- 3. os termos: paridade com o termos.py -- */
parte('os termos proibidos: o regras.mjs e o termos.py acham o mesmo');
const BASE = [
  'Remoção do FAP', 'remoção total do filtro de partículas', 'Anulação EGR', 'EGR off', 'egr-off', 'DPF delete', 'fap off', 'off fap',
  'limpeza do FAP', 'regeneração do filtro de partículas', 'Retirada da válvula EGR', 'desligar o adblue', 'by-pass ao catalisador', 'bypass catalizador',
  'programação para fora do EGR', 'EGR programado para fora', 'descarbonização do motor', 'Stage 1', 'stage2', 'chip tuning', 'remap', 'reprogramação de centralina',
  'airbags novos', 'AIRBAG', 'pré-tensor', 'pre tensor', 'pretensor', 'Sem garantia', 'sem qualquer garantia', 'não tem garantia', 'Não têm garantia', 'garantia: não', 'garantia = 0', 'garantia: nenhuma',
  'produto ecológico', 'eco-friendly', 'amigo do ambiente', 'sustentável', 'sustentáveis', 'carbono neutro', 'neutros em carbono', 'zero emissões', 'biodegradável', 'carro verde', 'verdes', 'esverdeado', '100% natural',
  'Somos os melhores', 'são os melhores', 'somos nº1', 'somos n.º 1', 'somos o nº 1', 'somos líderes', 'a melhor oficina', 'os melhores preços', 'líder de mercado', 'os mais baratos', 'preços imbatíveis', 'garantia vitalícia', 'satisfação garantida',
  'ec.europa.eu/odr', 'https://ec.europa.eu/consumers/odr', 'plataforma europeia de resolução de litígios em linha', 'Centro de Arbitragem do Sector Automóvel', 'CASA – Centro', 'CNIACC', 'cniacc',
  'Pokémon', 'pokemon', 'Pokébola', 'poke ball', 'Nintendo', 'Game Freak', 'pikachu', 'PokeAuto', 'pokeauto2026',
  'saldos de verão', 'Saldo', 'liquidação total', 'liquidações', 'liquidacao',
  'Oficina multimarca. Diagnóstico antes de orçamento, e o preço dito antes de se mexer no carro.',
  'Remoção e lavagem dos bancos, do chão e do tejadilho, higienização das condutas do ar condicionado, limpeza e remoção de manchas',
  'Inclui a remoção da jante para limpeza profunda', 'O seu carro merece o melhor cuidado',
  'remoção do FAP', 'remoção do FAP', 'remoção\u0085FAP', 'remoção\u001cFAP', 'remoção﻿FAP', 'FAP​off',
  'ſaldos', 'SALDOS', 'Liquidação', 'LIQUIDAÇÃO', 'airbagś', 'verde_x', 'verde1', 'verdeé', 'éverde', 'off_road egr', 'offegr', 'EGR\noff', 'EGR\n\noff',
  'café verde', 'fap\tdelete', 'sem　garantia', 'garantia:0', 'garantia 0', 'garantia 00', 'somos os melhores', 'somos n°1', 'são os melhor',
  'a remover o egr já', 'eliminação do EGR', 'inibir adblue', 'supressão do catalisador', 'corte do fap', 'desativação EGR', 'desactivar o DPF',
  'sonda lambda removida', 'remover sonda lambda', 'scr off', 'off scr', 'FAP  off', `${'x'.repeat(70)} fap`, `remoção ${'y'.repeat(55)} fap`, `remoção ${'y'.repeat(70)} fap`,
];
const CORPUS = [...BASE];
for (const b of BASE) CORPUS.push(b.toUpperCase(), b.toLowerCase(), `«${b}»`, `${b}.`, `x${b}x`);
const tmp = mkdtempSync(join(tmpdir(), 'pokeauto-guardas-'));
try {
  writeFileSync(join(tmp, 'corpus.json'), JSON.stringify(CORPUS));
  writeFileSync(join(tmp, 'py.py'), [
    'import json, re, sys',
    `sys.path.insert(0, ${JSON.stringify(join(RAIZ, '.github/scripts'))})`,
    'import termos',
    `corpus = json.load(open(${JSON.stringify(join(tmp, 'corpus.json'))}, encoding='utf-8'))`,
    'out = []',
    'for t in corpus:',
    '    r = []',
    '    for i, (p, n, rem) in enumerate(termos.REGRAS):',
    '        m = re.search(p, t, re.I)',
    '        if m: r.append([i, m.start(), m.end()])',
    '    out.append(r)',
    'print(json.dumps(out))',
  ].join('\n'));
  let py = null;
  try { py = JSON.parse(execFileSync(PYTHON, [join(tmp, 'py.py')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })); } catch (e) { console.log(`  (sem python3: ${e.message.split('\n')[0]})`); }
  if (py) {
    /* O Python conta em pontos de código; o JS em unidades UTF-16. */
    const pc = (s, i) => [...s.slice(0, i)].length;
    let dif = 0; let achados = 0;
    CORPUS.forEach((t, k) => {
      const js = R.termosEm(t).map((x) => [x.regra, pc(t, x.inicio), pc(t, x.fim)]);
      achados += js.length;
      if (JSON.stringify(js) !== JSON.stringify(py[k])) { dif++; if (dif <= 5) console.log(`    diferente: ${JSON.stringify(t)} js ${JSON.stringify(js)} py ${JSON.stringify(py[k])}`); }
    });
    certo(dif === 0, `o regras.mjs e o termos.py acham o mesmo em ${CORPUS.length} textos (${dif} diferenças)`);
    certo(achados > 300, `o corpus acha termos a sério (${achados})`);
    console.log(`  ${CORPUS.length} textos, ${achados} termos achados, ${dif} diferenças`);
    const nPy = Number(execFileSync(PYTHON, ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(join(RAIZ, '.github/scripts'))}); import termos; print(len(termos.REGRAS))`], { encoding: 'utf8' }).trim());
    certo(nPy === R.TERMOS.length, `as mesmas regras dos dois lados (${R.TERMOS.length} no regras.mjs, ${nPy} no termos.py)`);
  } else certo(false, 'a paridade com o termos.py precisa de um python3');

  /* ----------------------------------------------- 4. os casos que param -- */
  parte('os casos que param a publicação');
  const copia = join(tmp, 'site');
  const reporCopia = () => {
    rmSync(copia, { recursive: true, force: true });
    mkdirSync(copia, { recursive: true });
    cpSync(join(RAIZ, 'data'), join(copia, 'data'), { recursive: true });
    cpSync(join(RAIZ, 'assets', 'img'), join(copia, 'assets', 'img'), { recursive: true });
  };
  const ler = (f) => JSON.parse(readFileSync(join(copia, R.FICHEIROS[f]), 'utf8'));
  const escrever = (f, o) => writeFileSync(join(copia, R.FICHEIROS[f]), typeof o === 'string' ? o : R.serializar(o, '\n'));
  const caso = (nome, mexer, { ecra, classe = 'bloqueia', chave = null } = {}) => {
    reporCopia();
    mexer();
    const { lista } = conferir(copia);
    const achado = lista.find((p) => p.classe === classe && (!ecra || String(p.ecra).startsWith(ecra)) && (!chave || String(p.chave).includes(chave)));
    certo(Boolean(achado), `${nome} → ${classe}${ecra ? ` em «${ecra}»` : ''}${achado ? '' : ` (deu: ${lista.map((p) => `${p.classe}:${p.chave}`).join(', ') || 'nada'})`}`);
    return lista;
  };
  caso('um ficheiro de dados apagado', () => rmSync(join(copia, R.FICHEIROS.promocoes)), { ecra: R.ECRAS.promocoes, chave: 'ficheiro:falta' });
  caso('um JSON partido', () => escrever('lavagens', '{ "itens": [ '), { ecra: R.ECRAS.lavagens, chave: 'ficheiro:json' });
  caso('a lista dos preços com outra forma', () => { const o = ler('lavagens'); o.itens = 'nada'; escrever('lavagens', o); }, { ecra: R.ECRAS.lavagens, chave: 'itens:forma' });
  caso('um serviço sem o campo do nome', () => { const o = ler('servicos'); delete o.itens[0].titulo; escrever('servicos', o); }, { ecra: R.ECRAS.servicos, chave: 'titulo:falta' });
  caso('a morada (rua) vazia', () => { const o = ler('site'); o.contactos.morada_linha1 = ''; escrever('site', o); }, { ecra: 'Página', chave: 'morada_linha1:vazio' });
  caso('o código postal sem código postal', () => { const o = ler('site'); o.contactos.morada_linha2 = 'São João da Madeira'; escrever('site', o); }, { ecra: 'Página', chave: 'morada_linha2:forma' });
  caso('sem telefone e sem email', () => { const o = ler('site'); o.contactos.telefone = ''; o.contactos.email = ''; escrever('site', o); }, { ecra: 'Página', chave: 'sem_contacto' });
  caso('o NIF apagado', () => { const o = ler('site'); o.legal.nif = ''; escrever('site', o); }, { ecra: 'Página', chave: 'legal:nif:vazio' });
  caso('uma hora que o prerender.py não lê', () => { const o = ler('site'); o.horario[0].abre = '9h'; escrever('site', o); }, { ecra: 'Página', chave: 'abre:forma' });
  caso('um termo proibido numa descrição', () => { const o = ler('servicos'); o.itens[0].descricao = 'Fazemos a remoção do FAP.'; escrever('servicos', o); }, { ecra: R.ECRAS.servicos, chave: 'termos:' });
  caso('«saldos» numa campanha', () => { const o = ler('promocoes'); o.itens[0].titulo = 'Saldos de inverno'; escrever('promocoes', o); }, { ecra: R.ECRAS.promocoes, chave: 'termos:' });

  /* ------------------------------------------------------- 5. a guarda -- */
  parte('a guarda, chamada como o CI a chama');
  const guarda = (args, env = {}) => spawnSync(process.execPath, [join(RAIZ, '.github/guardas.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
  const r0 = guarda([]);
  certo(r0.status === 0, `com os dados de hoje sai com 0 (saiu ${r0.status}: ${r0.stderr})`);
  certo(!/^::error/m.test(r0.stdout), 'com os dados de hoje não há ::error');
  reporCopia();
  { const o = ler('site'); o.legal.nif = ''; escrever('site', o); }
  const resumo = join(tmp, 'resumo.md'); const rel = join(tmp, 'relatorio.json');
  const r1 = guarda(['--raiz', copia, '--relatorio-em', rel], { GITHUB_STEP_SUMMARY: resumo });
  certo(r1.status === 1, `com um «bloqueia» sai com 1 (saiu ${r1.status})`);
  certo(/^::error file=data\/site\.json,title=Página › Dados legais::.*NIF/m.test(r1.stdout), 'e diz porquê numa anotação ::error, com o ficheiro e o ecrã');
  certo(existsSync(resumo) && /A publicação parou/.test(readFileSync(resumo, 'utf8')), 'e escreve o resumo da corrida');
  certo(existsSync(rel) && JSON.parse(readFileSync(rel, 'utf8')).bloqueia >= 1, 'e o relatório');
  certo(guarda(['--raiz']).status === 2, 'uma chamada errada sai com 2');
  certo(guarda(['--raiz', join(tmp, 'nao-existe')]).status === 2, 'uma pasta que não existe sai com 2');
  /* Numa cópia do repositório em /tmp (no Mac, uma ligação para /private/tmp). */
  const emTmp = mkdtempSync('/tmp/pokeauto-guarda-');
  try {
    cpSync(join(RAIZ, '.github'), join(emTmp, '.github'), { recursive: true });
    cpSync(copia, emTmp, { recursive: true });
    const r2 = spawnSync(process.execPath, [join(emTmp, '.github/guardas.mjs')], { encoding: 'utf8' });
    certo(r2.status === 1 && /NIF/.test(r2.stdout), `numa cópia em /tmp corre, e pára (saiu ${r2.status})`);
  } finally { rmSync(emTmp, { recursive: true, force: true }); }
  /* Nenhum dado abre um comando do runner. */
  reporCopia();
  { const o = ler('servicos'); o.itens[0].titulo = 'Mecânica\n::error::falso\r\n##[warning]também falso'; o.itens[0].descricao = 'remoção do FAP %0A::error::x'; escrever('servicos', o); }
  const r3 = guarda(['--raiz', copia]);
  const comandos = r3.stdout.split('\n').filter((l) => /^\s*::|##\[/.test(l));
  certo(comandos.every((l) => /^::(error|warning|notice) file=/.test(l) || /^::(error|warning|notice) title=Guarda do conteúdo::/.test(l)), `só as anotações da guarda são comandos (${comandos.filter((l) => !/^::(error|warning|notice) (file|title)=/.test(l)).join(' | ')})`);
  certo(!/^::error::falso/m.test(r3.stdout) && !/##\[warning\]/.test(r3.stdout), 'um «::error» ou um «##[warning]» dentro de um texto não chega à consola como comando');
  const ans = anotacoes([{ classe: 'bloqueia', ficheiro: 'data/a,b:c.json', ecra: 'X, Y: Z', mensagem: 'linha 1\nlinha 2 100%' }]);
  certo(ans[0] === '::error file=data/a%2Cb%3Ac.json,title=X%2C Y%3A Z::linha 1%0Alinha 2 100%25', `as anotações escapam-se como o GitHub pede (${ans[0]})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

/* ---------------------------------------------------- 6. o prerender.yml -- */
parte('o prerender.yml');
const yml = readFileSync(join(RAIZ, '.github/workflows/prerender.yml'), 'utf8');
const passos = [...yml.matchAll(/^ {6}- (?:name: (.+)|uses: (\S+))$/gm)].map((m) => m[1] ?? `uses ${m[2]}`);
const i = (n) => passos.findIndex((p) => p === n);
certo(i('Conferir o conteúdo') > 0, 'há o passo «Conferir o conteúdo»');
for (const n of ['Verificar termos proibidos', 'Converter as fotografias novas para WebP', 'Cartão de partilha (WhatsApp e Facebook)', 'Medir as dimensões das imagens', 'Gerar o HTML estático', 'Publicar se houve alterações']) {
  certo(i(n) > i('Conferir o conteúdo'), `a guarda corre antes de «${n}»`);
}
certo(/node \.github\/guardas\.mjs/.test(yml), 'o passo corre o .github/guardas.mjs');
certo(i('uses actions/setup-node@v4') >= 0 && i('uses actions/setup-node@v4') < i('Conferir o conteúdo'), 'o node prepara-se antes da guarda');
for (const p of ['.github/regras.mjs', '.github/guardas.mjs', '.github/consola.mjs', 'data/**', 'assets/img/**']) certo(yml.includes(`- '${p}'`), `os paths do push incluem ${p}`);
certo(/^ {2}workflow_dispatch:/m.test(yml), 'há workflow_dispatch (o «Publicar outra vez» do painel)');
certo(/concurrency:\s*\n\s+group: prerender\s*\n\s+cancel-in-progress: true/.test(yml), 'a concorrência é a de sempre (a publicação que chega cancela a que está a correr)');

console.log(`\n${falhas ? `FALHOU: ${falhas} de ${falhas + certas}` : `tudo certo: ${certas} afirmações`}`);
process.exitCode = falhas ? 1 : 0;
