#!/usr/bin/env node
/* AS PEÇAS LEGAIS COMUNS, ESCRITAS NO HTML (a biblioteca legal-comum, em
 * legal-comum/, instalada por _ferramentas/legal-comum/instalar.mjs).
 *
 * O site é HTML escrito à mão, congelado pelo prerender.py. As peças que a lei
 * manda ter e que são iguais em todos os sites do Renato — o botão do Livro de
 * Reclamações, a nota do custo da chamada junto de cada botão «Ligar», a
 * tabela dos destinatários da política de privacidade e o bloco dos direitos —
 * não se escrevem à mão: saem daqui, da biblioteca, para dentro dos marcadores
 *
 *     <!-- legal-comum:<peça> v<versão> -->…<!-- /legal-comum:<peça> -->
 *
 * em index.html e em legal/*.html, e o CSS do botão para dentro de
 *
 *     /* legal-comum:livro-css v<versão> *​/…/* /legal-comum:livro-css *​/
 *
 * em assets/css/styles.css. Correr outra vez não muda nada (é idempotente): o
 * prerender.yml corre-o antes do prerender.py, e o passo que grava commita o
 * que mudou (index.html, legal/ e assets/css/styles.css estão nos ALVOS).
 *
 * O que depende dos dados (data/site.json): o telefone (a frase da nota), e o
 * email — com ele, o bloco dos direitos da privacidade passa a ser o da
 * biblioteca, com o email; sem ele, fica o bloco de telefone e morada. Nada se
 * inventa: um email que não existe não aparece.
 *
 * E as duas guardas em modo AVISAR (nunca param a publicação; só dizem):
 *   · a identificação do DL 7/2004, art. 10.º (verificarIdentificacao): hoje
 *     falta o email, e isso é do cliente;
 *   · os serviços da tabela das lavagens sem preço, «Sob consulta»
 *     (verificarProduto): a lei pede o preço ou o modo de o calcular (Lei
 *     24/96, art. 8.º). Não se esconde nada: é o cliente que dá os valores;
 *   · as campanhas de desconto a decorrer ou marcadas (verificarPromocao, DL
 *     70/2007, art. 5.º): a data de início, a de fim e a prova do preço mais
 *     baixo dos 30 dias anteriores (o «antes»). O preço de agora sai do «antes»
 *     e da percentagem, que é o que o site mostra.
 * No GitHub Actions saem como anotações ::warning.
 *
 *     node .github/legal.mjs              escreve o que mudou
 *     node .github/legal.mjs --verificar  não escreve; sai com 1 se algo estiver desactualizado
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VERSAO, esc, livroReclamacoes, livroCss, notaChamada, destinatariosHtml, frasesPrivacidade,
  direitosHtml, DIREITOS, CNPD_URL, verificarIdentificacao, verificarProduto, verificarPromocao, paraNumero,
} from '../legal-comum/index.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFICAR = process.argv.includes('--verificar');
const NO_CI = process.env.GITHUB_ACTIONS === 'true';

/* As cores do botão com caixa do Livro (a variante «botao», que o livroCss()
   escreve sempre): o dourado da marca com a tinta do fundo (11,09:1). O site
   usa a variante DISCRETA (por omissão desde a v1.1.0, a pedido do Renato):
   ícone e texto com a letra e a cor das ligações vizinhas, sem caixa. */
export const CORES_LIVRO = Object.freeze({ cor: '#0B0B0D', fundo: '#F5B921' });

/* Quem recebe mesmo dados a propósito deste site (a tabela da privacidade):
   o GitHub Pages aloja-o; o mapa é da Google e só carrega ao clique; o
   WhatsApp e o Instagram são da Meta. A Cloudflare só faz o DNS do domínio,
   sem tráfego de visitantes, e por isso não entra; não há email de terceiros,
   analytics, pagamentos nem formulários. */
export function destinatariosDe(site) {
  const c = site.contactos || {};
  return { alojamento: 'github-pages', mapas: 'google', whatsapp: true, instagram: Boolean(c.instagram_url), facebookPage: Boolean(c.facebook_url) };
}

/* Sem email não há direitosHtml (a biblioteca exige-o): o mesmo bloco, com os
   mesmos direitos (DIREITOS) e a CNPD, mas com o telefone e a morada da caixa
   de cima como canal. No dia em que o email entrar no painel, troca sozinho. */
function direitosSemEmail() {
  const itens = DIREITOS.map((d) => `<li><strong>${esc(d.nome)}</strong>: ${esc(d.descricao)}</li>`);
  return [
    '<div class="direitos" lang="pt">',
    '<p>Pode exercer os seus direitos pelo telefone ou pela morada indicados na caixa de identificação, no topo desta página. Respondemos no prazo de um mês (RGPD, art. 12.º, n.º 3).</p>',
    '<ul>', ...itens, '</ul>',
    `<p>Se achar que o tratamento não cumpre a lei, pode reclamar à Comissão Nacional de Protecção de Dados: <a href="${CNPD_URL}" target="_blank" rel="noopener">cnpd.pt</a>.</p>`,
    '</div>',
  ].join('\n');
}

/** As peças, pelo nome do marcador. Cada uma devolve o HTML, ou null quando não há como a escrever. */
export function pecas(site, avisar = () => {}) {
  const c = site.contactos || {};
  const email = String(c.email ?? '').trim();
  const nota = notaChamada(String(c.telefone ?? ''), { frase: 'com-a' });
  if (!nota) avisar(`O telefone «${c.telefone ?? ''}» não é um número nacional (2…, 9… ou 800…): a nota do custo da chamada junto dos botões «Ligar» fica como estava.`);
  return {
    livro: () => livroReclamacoes(),
    'nota-chamada': () => (nota ? `<small class="nota-chamada">(${esc(nota)})</small>` : null),
    privacidade: () => destinatariosHtml(destinatariosDe(site)),
    'privacidade-frases': () => frasesPrivacidade({ ...destinatariosDe(site), repositorioPublico: true }).map((f) => `<p>${esc(f)}</p>`).join('\n'),
    direitos: () => (email ? direitosHtml({ email }) : direitosSemEmail()),
  };
}

const MARCADOR_HTML = /<!-- legal-comum:([\w-]+) v\d+\.\d+\.\d+ -->[\s\S]*?<!-- \/legal-comum:\1 -->/g;
const MARCADOR_CSS = /\/\* legal-comum:livro-css v\d+\.\d+\.\d+ \*\/[\s\S]*?\/\* \/legal-comum:livro-css \*\//;

/** O HTML de uma página com as peças escritas; devolve também as peças que lá estão. */
export function aplicarHtml(html, PECAS) {
  const vistas = new Set();
  const novo = html.replace(MARCADOR_HTML, (todo, peca) => {
    vistas.add(peca);
    const gerar = PECAS[peca];
    if (!gerar) return todo;                      // um marcador que esta versão não conhece fica como está
    const conteudo = gerar();
    if (conteudo === null) return todo;
    const multilinha = conteudo.includes('\n');
    return `<!-- legal-comum:${peca} v${VERSAO} -->${multilinha ? '\n' : ''}${conteudo}${multilinha ? '\n' : ''}<!-- /legal-comum:${peca} -->`;
  });
  return { html: novo, vistas };
}

export function aplicarCss(css) {
  const bloco = `/* legal-comum:livro-css v${VERSAO} */\n${livroCss('lr-botao', CORES_LIVRO)}\n/* /legal-comum:livro-css */`;
  if (!MARCADOR_CSS.test(css)) return { css, tinha: false };
  return { css: css.replace(MARCADOR_CSS, bloco), tinha: true };
}

/* As guardas em modo avisar. */
/* O dia de hoje em Lisboa (AAAA-MM-DD), como o app.js e as regras comparam. */
const hojeEmLisboa = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date());

/** Os avisos das campanhas de desconto que ainda não acabaram (as acabadas já não aparecem no site). */
export function avisosDasPromocoes(promocoes, hoje = hojeEmLisboa()) {
  const avisos = [];
  for (const x of Array.isArray(promocoes?.itens) ? promocoes.itens : []) {
    if (!x || typeof x !== 'object' || x.tipo !== 'desconto') continue;
    const titulo = String(x.titulo ?? '').trim() || 'Campanha sem título';
    const fim = String(x.fim ?? '').trim();
    if (fim && fim < hoje) continue;
    const antes = paraNumero(String(x.antes ?? '').replace(/[^\d.,]/g, ''));
    const pct = paraNumero(String(x.percentagem ?? '').replace(/%/g, ''));
    const agora = antes > 0 && pct > 0 && pct < 100 ? Math.round(antes * (100 - pct)) / 100 : NaN;
    const r = verificarPromocao({ precoAntes: antes, precoAgora: agora, inicio: String(x.inicio ?? '').trim(), fim, historico: [], tipo: 'artigo' },
      { modo: 'avisar', ecra: `Promoções › ${titulo}` });
    for (const p of r.problemas) avisos.push(`Promoção «${titulo}» (DL 70/2007) — ${p.mensagem}`);
  }
  return avisos;
}

export function avisosDosDados(site, lavagens) {
  const avisos = [];
  const c = site.contactos || {};
  const L = site.legal || {};
  const sociedade = L.forma_juridica === 'sociedade';
  const r = verificarIdentificacao({
    nome: L.nome_titular,
    formaJuridica: sociedade ? 'lda' : 'eni',
    nif: sociedade ? L.nipc : L.nif,
    morada: [c.morada_linha1, c.morada_linha2].filter(Boolean).join(', '),
    email: c.email,
    telefone: c.telefone,
    sociedade: sociedade ? { sede: [c.morada_linha1, c.morada_linha2].filter(Boolean).join(', '), conservatoria: L.conservatoria, matricula: L.matricula, capital: L.capital_social } : undefined,
  }, { modo: 'avisar', ecra: { '*': 'Página › Dados legais', email: 'Página › Contactos', morada: 'Página › Contactos', telefone: 'Página › Contactos' } });
  for (const p of r.problemas) avisos.push(`Identificação (DL 7/2004, art. 10.º) — ${p.mensagem}`);
  for (const x of Array.isArray(lavagens?.itens) ? lavagens.itens : []) {
    if (!x || typeof x !== 'object' || typeof x.nome !== 'string' || !x.nome.trim()) continue;
    const ps = verificarProduto({ nome: x.nome, aVenda: true, preco: x.preco }, { modo: 'avisar', ecra: `Preços das lavagens › ${x.nome.trim()}` }).problemas;
    for (const p of ps.filter((q) => q.campo === 'preco')) avisos.push(`«${x.nome.trim()}» ${p.mensagem}`);
  }
  return avisos;
}

const escMsg = (s) => String(s).replace(/##\[/g, '## [').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

function main() {
  const site = JSON.parse(readFileSync(join(RAIZ, 'data', 'site.json'), 'utf8'));
  const lavagens = JSON.parse(readFileSync(join(RAIZ, 'data', 'lavagens.json'), 'utf8'));
  const promocoes = JSON.parse(readFileSync(join(RAIZ, 'data', 'promocoes.json'), 'utf8'));
  const avisos = [];
  const PECAS = pecas(site, (m) => avisos.push(m));

  const paginas = ['index.html', ...readdirSync(join(RAIZ, 'legal')).filter((f) => f.endsWith('.html')).sort().map((f) => `legal/${f}`)];
  const mudadas = [];
  const contagem = {};
  for (const rel of paginas) {
    const caminho = join(RAIZ, rel);
    const antes = readFileSync(caminho, 'utf8');
    const { html, vistas } = aplicarHtml(antes, PECAS);
    for (const p of vistas) contagem[p] = (contagem[p] ?? 0) + 1;
    if (html !== antes) {
      mudadas.push(rel);
      if (!VERIFICAR) writeFileSync(caminho, html);
    }
  }
  if (!contagem.livro) avisos.push('Nenhuma página tem o marcador legal-comum:livro — o botão do Livro de Reclamações não está a ser escrito.');

  const cssCaminho = join(RAIZ, 'assets', 'css', 'styles.css');
  const cssAntes = readFileSync(cssCaminho, 'utf8');
  const { css, tinha } = aplicarCss(cssAntes);
  if (!tinha) avisos.push('assets/css/styles.css não tem o bloco /* legal-comum:livro-css */ — o botão do Livro fica sem o CSS da biblioteca.');
  if (css !== cssAntes) {
    mudadas.push('assets/css/styles.css');
    if (!VERIFICAR) writeFileSync(cssCaminho, css);
  }

  avisos.push(...avisosDosDados(site, lavagens));
  avisos.push(...avisosDasPromocoes(promocoes));

  for (const a of avisos) {
    console.log(`  AVISO: ${a}`);
    if (NO_CI) console.log(`::warning title=Peças legais (legal-comum)::${escMsg(a)}`);
  }
  console.log(`  peças: ${Object.entries(contagem).map(([k, v]) => `${k}×${v}`).join(', ') || 'nenhuma'} (legal-comum v${VERSAO})`);
  if (VERIFICAR) {
    console.log(`Peças legais ${mudadas.length ? `DESATUALIZADAS em ${mudadas.join(', ')}` : 'em dia'}`);
    return mudadas.length ? 1 : 0;
  }
  console.log(mudadas.length ? `Peças legais escritas em ${mudadas.join(', ')}` : 'Peças legais já estavam em dia');
  return 0;
}

const souOPrincipal = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (souOPrincipal) process.exit(main());
