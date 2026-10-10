/* AS REGRAS DOS DADOS DA POKEAUTO, NUM SÓ SÍTIO.
 *
 * Três leitores, e os três têm de ouvir o mesmo:
 *   · o CI do site (.github/guardas.mjs, passo «Conferir o conteúdo» do
 *     prerender.yml), antes de converter as fotografias e de gerar o HTML;
 *   · o painel, no browser (o erro aparece por baixo do campo, antes de gravar);
 *   · o Worker do painel, ao gravar (recusa os problemas NOVOS que não sejam
 *     lembretes).
 * O painel usa uma CÓPIA BYTE A BYTE deste ficheiro (estatico/js/regras.js no
 * repositório pokeauto-painel), com um teste de SHA-256 que falha se
 * divergirem. Por isso é um ES module puro: nenhum import, nada de node:*, fs,
 * process ou require. Corre tal e qual no browser, num Worker e no Node.
 *
 * O SITE É O JUIZ. O que cada campo FAZ vem do assets/js/app.js (desenha as
 * secções no browser a partir de data/*.json) e dos scripts do CI
 * (.github/scripts/prerender.py, og.py, webp.py, termos.py): as regras olham
 * para o que o site faz com o valor, e não para o que o valor parece. As
 * ajudas e os rótulos que o dono lê são os do painel (vinham do .pages.yml do
 * Pages CMS, que o painel substitui em Outubro de 2026).
 *
 * O GITHUB PAGES SERVE O RAMO main TAL E QUAL (build_type legacy): o que se
 * grava em data/*.json fica público em segundos, e o app.js desenha-o. O CI só
 * congela uma cópia em HTML para os motores de busca (e faz as fotografias
 * leves e o cartão de partilha). Por isso a guarda do CI NÃO protege o site:
 * quando ela pára, o visitante já está a ver o que se gravou. Quem tem de
 * recusar é o painel, ANTES de gravar — e é por isso que o Worker confere
 * estas regras em cada gravação.
 *
 * CADA PROBLEMA TEM UMA CLASSE:
 *   · bloqueia   — a publicação pára no CI (o HTML dos motores de busca, as
 *                  fotografias leves e o cartão de partilha ficam como
 *                  estavam). É o que faria rebentar o prerender.py, o og.py ou
 *                  o webp.py, o que o termos.py trava (texto que não pode ir
 *                  para um site com o nome e a morada da empresa), e os dados
 *                  que a lei obriga e que não podem faltar (DL 7/2004, art.
 *                  10.º: a morada, o NIF; e um contacto).
 *   · neutraliza — o site, sozinho, não mostra a coisa (o app.js filtra-a):
 *                  um preço de lavagem sem nome, uma campanha sem o que a lei
 *                  obriga a dizer. Nada pára; mas o dono pensava que estava no
 *                  site. Os ficheiros nunca mudam por causa disto.
 *   · avisa      — o site mostra-o mal (uma fotografia que não existe aparece
 *                  partida, um botão fica sem texto, um título apagado deixa o
 *                  antigo à vista), ou um valor fora do que o painel aceita
 *                  (comprido de mais, fora da lista). No painel é erro de campo:
 *                  não deixa gravar; um valor estranho num commit à mão não
 *                  pára o CI. Os LEMBRETES (lembrete: true) não são erro de
 *                  ninguém: o painel grava na mesma e mostra-os no Início (uma
 *                  campanha que já acabou, o email que a lei pede e ainda não
 *                  está no site).
 *
 * dados = { lavagens, promocoes, servicos, site, trabalhos }
 *   cada um: o TEXTO do ficheiro data/<nome>.json, ou o objecto já lido, ou
 *   null (o ficheiro não existe). Uma chave AUSENTE não se confere (o painel
 *   confere só o ficheiro que mudou).
 *
 * opcoes = {
 *   existe(caminho) → bool   que ficheiros há no repositório (as fotografias e
 *                            as variantes que o webp.py fez); sem ele, as
 *                            fotografias não se conferem;
 *   hoje: 'AAAA-MM-DD'       o dia em Lisboa (as campanhas aparecem e
 *                            desaparecem sozinhas com a data); por omissão, hoje.
 * }
 *
 * problema = {
 *   classe:   'bloqueia' | 'neutraliza' | 'avisa',
 *   chave:    estável: '<ficheiro>:<de quem>:<regra>'. O Worker compara as
 *             chaves do HEAD com as da gravação e recusa só as novas; por isso
 *             UMA CHAVE TEM SEMPRE A MESMA CLASSE, e não leva a POSIÇÃO de um
 *             item numa lista (juntar um preço no topo não pode fazer de um
 *             problema antigo um problema novo): leva o nome dele.
 *   ficheiro: 'data/<nome>.json';
 *   ecra:     o ecrã do painel onde se corrige («Preços das lavagens ›
 *             Lavagem exterior», «Página › Contactos»);
 *   mensagem: para o dono, em português simples, sem caminhos de JSON;
 *   campo?:   onde está, AGORA, o campo ('itens.3.preco', 'contactos.email'):
 *             o painel leva o foco até ele (esse leva a posição);
 *   servico?: o identificador do serviço (o ecrã de cada serviço é por ele);
 *   efeito?:  só nos «neutraliza»: 'esconder';
 *   lembrete?: true nos avisos que não são erro de ninguém.
 * }
 *
 * «NÃO FOI DITO» E "" SÃO O MESMO: os ficheiros escrevem os campos vazios
 * como "" (o Pages CMS e o painel), e um commit à mão pode tirá-los. E o vazio
 * testa-se ANTES de converter: Number('') é 0. */

/* ------------------------------------------------------------------ */
/* Onde estão as coisas                                                */
/* ------------------------------------------------------------------ */

export const FICHEIROS = Object.freeze({
  lavagens: 'data/lavagens.json',
  promocoes: 'data/promocoes.json',
  servicos: 'data/servicos.json',
  site: 'data/site.json',
  trabalhos: 'data/trabalhos.json',
});
/* Pela ordem do menu (a do .pages.yml: o que o dono mexe mais vem primeiro). */
export const ORDEM = Object.freeze(['lavagens', 'promocoes', 'servicos', 'site', 'trabalhos']);
export const ECRAS = Object.freeze({
  lavagens: 'Preços das lavagens',
  promocoes: 'Promoções',
  servicos: 'Serviços',
  site: 'Página',
  trabalhos: 'Fotografias só para o Google',
});
/** O nome curto ('lavagens'…) de um caminho de ficheiro, ou null. */
export const ficheiroDe = (caminho) => ORDEM.find((k) => FICHEIROS[k] === caminho) ?? null;

/* AS BIBLIOTECAS DAS FOTOGRAFIAS. Para o dono, uma fotografia é um ORIGINAL:
   o ficheiro que se carregou. O webp.py faz de cada original de
   assets/img/trabalhos/originais/ as variantes que o site serve
   (<nome>-320.webp … -1800.webp), na pasta-mãe; elas e as ilustrações das
   categorias das lavagens (cat-<categoria>-128.webp) nunca se mostram nem se
   escolhem. A das lavagens não tem variantes (o webp.py só trata
   «trabalhos»): o site serve o ficheiro tal e qual, num quadrado de 64 px —
   por isso o painel reduz as fotografias dela a 640 px. */
export const BIBLIOTECAS = Object.freeze({
  fotos: Object.freeze({ pasta: 'assets/img/trabalhos/originais', variantes: 'assets/img/trabalhos', site: 'trabalhos', nome: 'Fotografias' }),
  lavagens: Object.freeze({ pasta: 'assets/img/lavagens', variantes: 'assets/img/lavagens', site: 'lavagens', nome: 'Fotografias das lavagens' }),
});
export const EXTENSOES_FOTO = Object.freeze(['jpg', 'jpeg', 'png', 'webp']);
/* As larguras que o app.js procura (LARGURAS_FOTO): uma fotografia está
   pronta no site quando alguma destas existe. */
export const LARGURAS_SITE = Object.freeze([320, 400, 420, 480, 560, 640, 760, 840, 960, 1280, 1800]);
/* Uma variante é qualquer ficheiro que acabe em -<número>.webp (o E_VARIANTE
   do webp.py, que as salta: um original assim nunca ganha variantes). */
const RE_VARIANTE = /-\d+\.webp$/i;
export const eVariante = (nome) => RE_VARIANTE.test(String(nome ?? '').split('/').pop());

/* O NOME BASE de um valor de fotografia, como o app.js o calcula
   (baseDaFoto): sem a pasta, sem a extensão e sem a largura do fim
   («-\d{2,4}»). É por ele que o site procura as variantes. */
export function baseDaFoto(valor) {
  let v = String(valor ?? '').trim();
  if (!v) return '';
  v = v.split('?')[0].split('/').pop();
  v = v.replace(/\.(webp|jpe?g|png|avif)$/i, '');
  v = v.replace(/-\d{2,4}$/, '');
  return v;
}

/** Um caminho do repositório sem a barra à frente nem o «?» do fim. */
export const noRepositorio = (c) => String(c ?? '').trim().replace(/^\/+/, '').split('?')[0];

/**
 * UM ORIGINAL DE UMA BIBLIOTECA: um ficheiro directamente na pasta dela, com
 * uma extensão de fotografia, que não é uma variante. → 'fotos' | 'lavagens' | null
 */
export function bibliotecaDe(caminho) {
  const c = noRepositorio(caminho);
  for (const [k, b] of Object.entries(BIBLIOTECAS)) {
    if (!c.startsWith(`${b.pasta}/`)) continue;
    const nome = c.slice(b.pasta.length + 1);
    if (!nome || nome.includes('/')) continue;
    const ext = /\.([a-z0-9]+)$/i.exec(nome)?.[1]?.toLowerCase();
    if (!ext || !EXTENSOES_FOTO.includes(ext) || eVariante(nome)) continue;
    return k;
  }
  return null;
}

/* UM NOME QUE O SITE SERVE BEM: só letras sem acento, algarismos, «.», «-» e
   «_» (um espaço ou uma vírgula partem o srcset: memória
   srcset-nome-com-espaco), e um nome base que não acabe em «-<2 a 4
   algarismos>» — o app.js tirava-os como se fossem a largura, e a fotografia
   nunca chegava às variantes (servia-se o original, pesado). As que o painel
   carrega são sempre assim (<prefixo>-<8 hex>.jpg). */
export function nomeSeguro(caminho) {
  const nome = noRepositorio(caminho).split('/').pop();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nome)) return false;
  const base = nome.replace(/\.[a-z0-9]+$/i, '');
  return base === baseDaFoto(nome);
}

/**
 * COMO O SITE MOSTRA UMA FOTOGRAFIA (o resolverFoto do app.js):
 *   valor  o que está no campo
 *   pasta  'trabalhos' (o topo, a faixa, os serviços) ou 'lavagens'
 *   existe(caminho) → bool
 * → { estado: 'vazia' }                       sem fotografia
 *   { estado: 'pronta', larguras }            o site serve as variantes
 *   { estado: 'por-preparar', caminho }       o original existe e o CI vai
 *                                             fazer-lhe as variantes (até lá o
 *                                             site serve o original)
 *   { estado: 'tal-e-qual', caminho }         o site serve o ficheiro como está
 *   { estado: 'falta', caminho? }             no site aparece partida (ou nada)
 */
export function fotoNoSite(valor, pasta, existe) {
  const base = baseDaFoto(valor);
  if (!base) return { estado: 'vazia' };
  const raiz = `assets/img/${pasta}/${base}`;
  const larguras = LARGURAS_SITE.filter((w) => existe(`${raiz}-${w}.webp`));
  if (larguras.length) return { estado: 'pronta', larguras, raiz };
  const cru = String(valor ?? '').trim();
  if (!cru.includes('/')) return { estado: 'falta' };
  const c = noRepositorio(cru);
  if (!existe(c)) return { estado: 'falta', caminho: c };
  return { estado: pasta === 'trabalhos' && bibliotecaDe(c) === 'fotos' && nomeSeguro(c) ? 'por-preparar' : 'tal-e-qual', caminho: c };
}

/* O cartão de partilha (og.py, escolher_foto): a maior variante do nome base
   em assets/img/trabalhos, de QUALQUER largura; sem nenhuma, a da jante. Um
   original novo em originais/ ganha-as antes (o webp.py corre primeiro). */
export function fotoDoCartao(valor, existe, listarPasta = null) {
  const base = baseDaFoto(valor);
  if (!base) return { estado: 'vazia' };
  const nomes = typeof listarPasta === 'function' ? listarPasta('assets/img/trabalhos') : [];
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.webp$`);
  if (nomes.some((n) => re.test(n)) || LARGURAS_SITE.some((w) => existe(`assets/img/trabalhos/${base}-${w}.webp`))) return { estado: 'pronta' };
  const c = noRepositorio(valor);
  if (c.includes('/') && existe(c) && bibliotecaDe(c) === 'fotos' && nomeSeguro(c)) return { estado: 'por-preparar', caminho: c };
  return { estado: 'falta', caminho: c || undefined };
}

/* AS FOTOGRAFIAS QUE O CÓDIGO DO SITE USA SOZINHO, fora dos dados: o og.py
   usa a da jante quando a do cartão falta. Não se apagam da biblioteca. (O
   .github/test-guardas.mjs confere que o og.py continua a dizer isto.) */
export const FOTOGRAFIAS_DO_CODIGO = Object.freeze(['faixa-jante']);

/**
 * AS FOTOGRAFIAS QUE AS PARTES FIXAS DO index.html MOSTRAM: as que estão FORA
 * das zonas que o prerender.py reescreve (<!--pre:id-->…<!--/pre:id-->) — a
 * fachada da oficina, por cima do mapa, está escrita à mão no HTML. As de
 * dentro das zonas vêm dos dados e mudam com eles. → Set dos nomes base.
 */
export function fotografiasFixas(html) {
  const s = typeof html === 'string' ? html : '';
  const semZonas = s.replace(/<!--pre:([\w-]+)-->[\s\S]*?<!--\/pre:\1-->/g, '');
  const out = new Set();
  for (const m of semZonas.matchAll(/assets\/img\/(?:trabalhos|lavagens)\/[^"'\s,)]+/g)) {
    const b = baseDaFoto(m[0]);
    if (b) out.add(b);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Os campos de cada ficheiro                                          */
/* ------------------------------------------------------------------ */

/* As chaves que o painel conhece, pela ordem em que estão nos ficheiros (um
   campo que falta entra no lugar dele; um item novo nasce com todas, vazias,
   como os outros). O que não está aqui o painel não mexe: fica como está. */
export const CAMPOS = Object.freeze({
  head: ['etiqueta', 'titulo', 'lead'],
  lavagens: { topo: ['head', 'itens'], item: ['nome', 'categoria', 'inclui', 'duracao', 'preco', 'preco_grande', 'unidade', 'foto'] },
  promocoes: { topo: ['head', 'itens'], item: ['titulo', 'tipo', 'percentagem', 'antes', 'oferta', 'inicio', 'fim', 'condicoes'] },
  servicos: {
    topo: ['head', 'itens'],
    item: ['id', 'titulo', 'descricao', 'tempo', 'foto', 'legenda_foto', 'alias', 'fotos', 'detalhe'],
    /* Fora do formulário (no .pages.yml estavam escondidos ou só de leitura):
       o painel mostra o id e os endereços antigos, e nunca lhes mexe. */
    soLeitura: ['id', 'alias', 'ligacao', 'ligacao_texto'],
    foto: ['nome', 'legenda'],
  },
  site: {
    topo: ['seo', 'og', 'hero', 'contactos', 'contactos_head', 'faixa', 'horario', 'legal', 'rodape_frase'],
    seo: ['titulo', 'descricao'],
    og: ['titulo', 'subtitulo', 'foto'],
    hero: ['etiqueta', 'titulo', 'destaque', 'lead', 'cta_principal', 'cta_secundario', 'foto', 'nota'],
    contactos: ['telefone', 'telefone_intl', 'custo_chamada', 'email', 'morada_linha1', 'morada_linha2', 'instagram_url', 'instagram_handle', 'facebook_url', 'maps_url'],
    contactos_head: ['etiqueta', 'titulo', 'lead'],
    faixa: ['texto', 'destaque', 'foto'],
    horario: ['dias', 'abre', 'fecha'],
    legal: ['forma_juridica', 'nome_titular', 'designacao_comercial', 'nif', 'nipc', 'conservatoria', 'matricula', 'capital_social'],
  },
  trabalhos: { topo: ['head', 'items'], item: ['img', 'cap'] },
});
/* As secções do data/site.json que são objectos (o horário é uma lista). */
export const SECCOES_SITE = Object.freeze(['seo', 'og', 'hero', 'contactos', 'contactos_head', 'faixa', 'legal']);
/* As partes do ecrã «Página», com o nome que o dono vê: [parte, título, chave do ficheiro]. */
export const PARTES_SITE = Object.freeze([
  ['contactos', 'Contactos', 'contactos'],
  ['horario', 'Horário', 'horario'],
  ['topo', 'Topo da página', 'hero'],
  ['faixa', 'Faixa', 'faixa'],
  ['onde', '«Onde estamos»', 'contactos_head'],
  ['rodape', 'Rodapé', 'rodape_frase'],
  ['google', 'Google', 'seo'],
  ['partilha', 'Partilha', 'og'],
  ['legal', 'Dados legais', 'legal'],
]);
export const parteDoSite = (chave) => PARTES_SITE.find(([, , k]) => k === chave) ?? null;

/* Os campos escondidos no Pages CMS, que o painel guarda e não mostra: o
   destaque do título do topo e o número internacional (que o painel passa a
   escrever sozinho, a partir do telefone: antes, mudar o telefone no Pages
   CMS deixava os botões de ligar e do WhatsApp no número antigo). */
export const ESCONDIDOS_SITE = Object.freeze({ hero: ['destaque'], contactos: ['telefone_intl'] });

export const CATEGORIAS_LAVAGENS = Object.freeze(['Lavagens', 'Extras', 'Interior']);
export const TIPOS_PROMOCAO = Object.freeze({ desconto: 'Desconto numa percentagem', extra: 'Oferta de um extra, sem baixar o preço' });
export const DIAS = Object.freeze({ Monday: 'Segunda', Tuesday: 'Terça', Wednesday: 'Quarta', Thursday: 'Quinta', Friday: 'Sexta', Saturday: 'Sábado', Sunday: 'Domingo' });
export const FORMAS_JURIDICAS = Object.freeze({ eni: 'Empresário em Nome Individual', sociedade: 'Sociedade (Lda / Unipessoal Lda)' });
/* Os campos que a lei obriga numa sociedade (CSC, art. 171.º; o prerender.py
   pára sem eles). */
export const CAMPOS_SOCIEDADE = Object.freeze({ nipc: 'NIPC', conservatoria: 'conservatória', matricula: 'n.º de matrícula', capital_social: 'capital social' });

/* Os rótulos dos campos (as mensagens dos conflitos e dos problemas). */
export const NOMES = Object.freeze({
  etiqueta: 'Etiqueta', titulo: 'Título', lead: 'Subtítulo',
  nome: 'Nome do serviço', categoria: 'Categoria', inclui: 'O que inclui', duracao: 'Quanto tempo demora', preco: 'Preço para ligeiros',
  preco_grande: 'Preço para SUV e carrinhas', unidade: 'A que se refere o preço', foto: 'Fotografia',
  tipo: 'Tipo de campanha', percentagem: 'Desconto (%)', antes: 'Preço mais baixo dos últimos 30 dias', oferta: 'O que está incluído',
  inicio: 'Começa em', fim: 'Acaba em', condicoes: 'Condições',
  descricao: 'Descrição', tempo: 'Tempo médio', legenda_foto: 'Legenda da fotografia de capa', detalhe: 'Texto do detalhe', fotos: 'Fotografias do detalhe', legenda: 'Legenda',
  img: 'Imagem', cap: 'Legenda',
});

/* ------------------------------------------------------------------ */
/* Limites                                                             */
/* ------------------------------------------------------------------ */

/* Tamanhos máximos, em caracteres. Folgados: o maior texto de hoje cabe com
   espaço. (O Pages CMS não tinha limites nenhuns.) */
export const TAMANHOS = Object.freeze({
  etiqueta: 60, tituloSeccao: 80, lead: 400,
  nomeLavagem: 80, inclui: 300, duracao: 40, preco: 30, unidade: 40,
  tituloPromocao: 80, percentagem: 5, antes: 30, oferta: 160, condicoes: 400,
  tituloServico: 60, descricao: 400, tempo: 40, legenda: 140, detalhe: 2000, fotosServico: 12,
  telefone: 20, custoChamada: 80, email: 160, morada: 120, codigoPostalLocalidade: 80, url: 500, instagram: 40,
  heroEtiqueta: 80, heroTitulo: 80, heroLead: 400, botao: 30, nota: 120,
  faixaTexto: 120, faixaDestaque: 80, rodape: 240,
  seoTitulo: 120, seoDescricao: 320, ogTitulo: 60, ogSubtitulo: 100,
  nomeTitular: 160, designacao: 80, nif: 20, conservatoria: 80, matricula: 40, capital: 40,
  cap: 200, caminhoFoto: 300,
  itensLavagens: 60, itensPromocoes: 20, itensServicos: 20, itensTrabalhos: 60, horario: 14,
});
/* O que o Google mostra sem cortar: lembra-se a partir daqui. */
export const GOOGLE = Object.freeze({ titulo: 60, descricao: 155 });
/* O que o Worker do painel aceita gravar num ficheiro (recusa acima). */
export const TECTOS = Object.freeze({ ficheiroBytes: 64 * 1024 });

/* ------------------------------------------------------------------ */
/* Ajudantes que o painel e o Worker também usam                      */
/* ------------------------------------------------------------------ */

const eObjecto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const ausente = (x) => x === null || x === undefined;
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** O texto de um campo: '' quando não foi dito; null quando lá está outra
 *  coisa que não um texto (um número, uma lista — de um commit à mão). */
const textoDe = (v) => (ausente(v) ? '' : typeof v === 'string' ? v : null);
const limpo = (v) => (typeof v === 'string' ? v.trim() : '');
const temDigito = (s) => /\p{Nd}/u.test(String(s ?? ''));

export const terminacaoDe = (texto) => (typeof texto === 'string' && texto.endsWith('\n') ? '\n' : '');
/* Como os ficheiros estão escritos: 2 espaços, e a terminação de cada um (o
   data/trabalhos.json vem sem \n no fim; os outros, com). Abrir e gravar sem
   mexer deixa o ficheiro igual, byte a byte. */
export function serializar(obj, terminacao = '') { return JSON.stringify(obj, null, 2) + (terminacao || ''); }

/** Dois valores lidos de JSON são o mesmo? null ≡ ausente; sem ligar à ordem das chaves. */
export function igual(a, b) {
  if (ausente(a) && ausente(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  if (eObjecto(a) || eObjecto(b)) {
    if (!eObjecto(a) || !eObjecto(b)) return false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!igual(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

/* O DIA DE HOJE EM LISBOA, AAAA-MM-DD, como o app.js o calcula (o sv-SE dá
   sempre esse formato): as campanhas comparam-se como texto. O Chrome do CI
   corre em UTC; é o dia de Lisboa que manda. */
export function hojeEmLisboa(agora = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(agora);
}
const RE_DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const dataValida = (s) => typeof s === 'string' && RE_DATA.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** «2026-08-31» → «31 de agosto de 2026» (como o site o escreve). */
export function diaPorExtenso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
}

/* NIF (e NIPC) português: 9 algarismos, o de controlo pelo módulo 11. */
export function nifValido(nif) {
  const s = typeof nif === 'number' ? String(nif) : String(nif ?? '').trim();
  if (!/^[1-9][0-9]{8}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(s[8]);
}

export const emailValido = (s) => typeof s === 'string' && s.length <= TAMANHOS.email && /^[^@\s,;<>"'()[\]]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(s) && /\.[a-z]{2,}$/i.test(s);
export const urlHttps = (s) => {
  if (typeof s !== 'string' || !/^https:\/\/[^\s"'<>]+$/.test(s) || s.length > TAMANHOS.url) return false;
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
};

/* O TELEFONE. O site escreve o número como se lê («922 022 364»), liga e abre
   o WhatsApp pelo internacional (351922022364) e escreve ao lado o custo da
   chamada, que a lei obriga (DL 59/2021). Um telemóvel começa por 91, 92, 93
   ou 96; um fixo por 2. */
export const CUSTO_CHAMADA = Object.freeze({ movel: '(Chamada para a rede móvel nacional)', fixa: '(Chamada para a rede fixa nacional)' });
/** O que se escreveu no campo do telefone → { digitos, rede, intl, texto }
 *  ou null (vazio) ou undefined (não é um número português). */
export function lerTelefone(t) {
  const s = String(t ?? '').trim();
  if (!s) return null;
  if (!/^[0-9 +.()-]+$/.test(s)) return undefined;
  let d = s.replace(/[^0-9]/g, '');
  if (d.length === 12 && d.startsWith('351')) d = d.slice(3);
  if (!/^[0-9]{9}$/.test(d)) return undefined;
  const rede = /^9[1236]/.test(d) ? 'movel' : /^2/.test(d) ? 'fixa' : null;
  if (!rede) return undefined;
  return { digitos: d, rede, intl: `351${d}`, texto: `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` };
}

/* O IDENTIFICADOR DE UM SERVIÇO NOVO (o fim dos endereços #servico-<id> e
   #detalhe-<id>): gerado UMA vez, ao criar, a partir do nome, e nunca mais
   muda (os links de fora — um cartão de visita, uma publicação no Instagram
   — guardam-no). Só minúsculas, algarismos e hífens, sem acentos; livre
   entre os identificadores E os endereços antigos de todos os serviços.
   Repetido: -2, -3… */
export const RE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function gerarId(titulo, existentes = []) {
  const ja = existentes instanceof Set ? existentes : new Set(existentes);
  let base = String(ausente(titulo) ? '' : titulo)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
  if (!base) base = 'servico';
  let id = base;
  for (let n = 2; ja.has(id); n++) id = `${base}-${n}`;
  return id;
}
/** Os identificadores e endereços antigos ocupados no data/servicos.json. */
export function idsOcupados(servicos) {
  const s = new Set();
  for (const x of Array.isArray(servicos?.itens) ? servicos.itens : []) {
    if (!eObjecto(x)) continue;
    if (typeof x.id === 'string' && x.id) s.add(x.id);
    for (const a of Array.isArray(x.alias) ? x.alias : []) if (typeof a === 'string' && a) s.add(a);
  }
  return s;
}

/* UM ITEM NOVO, com todos os campos vazios e pela ordem dos outros. */
export function itemNovo(ficheiro, extra = {}) {
  const base = {
    lavagens: { nome: '', categoria: 'Lavagens', inclui: '', duracao: '', preco: '', preco_grande: '', unidade: '', foto: '' },
    promocoes: { titulo: '', tipo: 'desconto', percentagem: '', antes: '', oferta: '', inicio: '', fim: '', condicoes: '' },
    servicos: { id: '', titulo: '', descricao: '', tempo: '', foto: '', legenda_foto: '', alias: [], fotos: [], detalhe: '' },
    trabalhos: { img: '', cap: '' },
    horario: { dias: [], abre: '', fecha: '' },
    foto: { nome: '', legenda: '' },
  }[ficheiro];
  if (!base) throw new Error(`itemNovo: não conheço ${ficheiro}`);
  return { ...structuredCloneSimples(base), ...extra };
}
const structuredCloneSimples = (o) => JSON.parse(JSON.stringify(o));

/**
 * UM CAMPO QUE FALTA ENTRA NO SEU LUGAR (a ordem `ordem`), e não no fim: o
 * ficheiro fica como os outros itens. Os que já lá estão ficam onde estão.
 * Devolve um objecto novo; `obj` não muda.
 */
export function comCampo(obj, k, v, ordem) {
  if (tem(obj, k)) return { ...obj, [k]: v };
  const chaves = Object.keys(obj);
  const pos = ordem.indexOf(k);
  let antesDe = chaves.length;
  if (pos >= 0) {
    for (let i = 0; i < chaves.length; i++) {
      const p = ordem.indexOf(chaves[i]);
      if (p > pos) { antesDe = i; break; }
    }
  }
  const out = {};
  chaves.forEach((c, i) => { if (i === antesDe) out[k] = v; out[c] = obj[c]; });
  if (antesDe === chaves.length) out[k] = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* Os termos proibidos (o .github/scripts/termos.py)                   */
/* ------------------------------------------------------------------ */

/* AS EXPRESSÕES DO termos.py, COPIADAS TAL E QUAL, na sintaxe do re do Python
   (o .github/test-guardas.mjs confere-as, texto a texto, com as do termos.py,
   e corre as duas sobre os mesmos textos). O termos.py continua a ser o
   primeiro guarda do CI e a ver também o index.html e as páginas legais; daqui
   saem as mesmas regras para o painel, que as aplica ANTES de gravar.
   [expressão, o que é, o que fazer] */
export const TERMOS = Object.freeze([
  ['\\b(anul\\w*|remo[çc]\\w*|remover|retirad\\w*|retirar|elimina\\w*|desactiv\\w*|desativ\\w*|desligar|inibi\\w*|by-?pass|delete|off\\b|supress\\w*|corte)\\b[\\s\\S]{0,60}?\\b(fap|dpf|egr|catalisador|cataliz\\w*|adblue|scr|sonda\\s+lambda|v[áa]lvula\\s+egr|filtro\\s+de\\s+part[íi]culas)\\b',
    'anulação/remoção de sistema de controlo de emissões',
    'Só se pode anunciar limpeza, regeneração ou substituição por peça homologada.'],
  ['\\b(fap|dpf|egr|adblue|catalisador|filtro\\s+de\\s+part[íi]culas)\\b[\\s\\S]{0,60}?\\b(anul\\w*|remo\\w*|retirad\\w*|elimina\\w*|off\\b|delete|desactiv\\w*|desativ\\w*|programa\\w*\\s+(para\\s+)?fora)\\b',
    'anulação/remoção de sistema de controlo de emissões',
    'Só se pode anunciar limpeza, regeneração ou substituição por peça homologada.'],
  ['\\bdescarboniza\\w*\\b[\\s\\S]{0,40}?\\b(fap|dpf|egr|motor)\\b|\\bstage\\s*[123]\\b|\\bchip\\s*tuning\\b|\\bremap\\w*\\b|\\breprograma\\w*\\s+(de\\s+)?centralina',
    'reprogramação/potenciação de motor',
    'Alterações às características do veículo têm de ser homologadas pelo IMT (Código da Estrada art.114). Não anunciar sem homologação confirmada.'],
  ['\\bairbag',
    'airbag',
    'Airbags e pré-tensores são pirotecnia P1 (DL 135/2015): não podem ser disponibilizados ao público. Retirar do catálogo de peças.'],
  ['pr[ée]\\s*-?\\s*tensor|pretensor',
    'pré-tensor de cinto',
    'Mesma regra dos airbags: pirotecnia P1, não pode ser vendido ao público.'],
  ['sem\\s+(qualquer\\s+)?garantia|n[ãa]o\\s+t[eê]m?\\s+garantia|garantia\\s*[:=]?\\s*(n[ãa]o|nenhuma|0\\b)',
    'negação de garantia',
    'O DL 84/2021 dá 3 anos em peças novas e 18 meses no mínimo em usadas. A frase é nula e é prática comercial desleal.'],
  ['\\b(ecol[óo]gic\\w*|eco-?friendly|amig\\w*\\s+do\\s+ambiente|sustent[áa]vel|sustent[áa]veis|carbono\\s+neutro|neutr\\w*\\s+em\\s+carbono|zero\\s+emiss[õo]es|biodegrad[áa]vel|verde\\b|100%\\s*natural)\\b',
    'alegação ambiental genérica',
    'A Diretiva (UE) 2024/825 proíbe estas alegações sem prova a partir de 27-09-2026. Dizer o que se faz em concreto, não adjectivar.'],
  ['\\b(somos|s[ãa]o)\\s+(os\\s+)?(melhor\\w*|n[ºo°]?\\s*1\\b|l[íi]der\\w*)|\\b[ao]s?\\s+melhor\\w*\\s+(oficina|mec[âa]nic\\w*|servi[çc]\\w*|pre[çc]\\w*|empresa|equipa)\\b|\\bl[íi]der\\s+(de\\s+mercado|do\\s+sector|na\\s+regi[ãa]o)|\\bos\\s+mais\\s+barat\\w*|\\bpre[çc]os?\\s+imbat[íi]ve\\w*|\\bgarantia\\s+vital[íi]cia|\\bsatisfa[çc][ãa]o\\s+garantida\\b',
    'superlativo sobre a empresa, sem prova',
    'O DL 57/2008 trata como enganosa a alegação que não se consegue demonstrar. Dizer o que se faz vale mais do que dizer que se é o melhor.'],
  ['ec\\.europa\\.eu/(consumers/)?odr|plataforma\\s+(europeia\\s+)?de\\s+resolu[çc][ãa]o\\s+de\\s+lit[íi]gios(\\s+em\\s+linha)?',
    'plataforma ODR europeia',
    'Foi desligada e revogada em 20-07-2025 pelo Reg. (UE) 2024/3228. A entidade correcta para São João da Madeira é o CICAP.'],
  ['Centro\\s+de\\s+Arbitragem\\s+do\\s+Sector\\s+Autom[óo]vel|\\bCASA\\s*[-–—]\\s*Centro',
    'CASA (Centro de Arbitragem do Sector Automóvel)',
    'Foi extinta em 10-01-2024. A entidade competente é o CICAP.'],
  ['\\bCNIACC\\b',
    'CNIACC',
    'É residual. São João da Madeira integra a Área Metropolitana do Porto e está expressamente coberta pelo CICAP (Despacho n.º 3077/2025).'],
  ['\\bpok[ée]mon\\b|\\bpok[ée]\\s?bola\\b|\\bpoke\\s?ball\\b|\\bnintendo\\b|\\bgame\\s?freak\\b|\\bpikachu\\b',
    'referência ao universo Pokémon',
    'O logótipo já faz o trocadilho. Escrevê-lo em texto transforma uma paródia gráfica numa associação declarada a uma marca registada.'],
  ['\\bsaldos?\\b|\\bliquida[çc][ãa]o\\b|\\bliquida[çc][õo]es\\b',
    'modalidade de venda que esta oficina não pode praticar',
    'O DL 70/2007 só conhece saldos, promoções e liquidação, e as duas primeiras obrigam a declaração prévia à ASAE. Escreva «promoção» — a palavra é escrita pelo próprio site, no selo da campanha.'],
]);

/* DO re DO PYTHON PARA O RegExp DO JAVASCRIPT, SEM MUDAR O QUE ENCONTRA. Num
   padrão de texto do Python 3, \w, \b e \s são do Unicode: «remoção» é uma
   palavra só. No JavaScript, mesmo com a bandeira u, \w e \b são só do ASCII —
   «remo[çc]\w*» parava no «ç», e «\bverde» achava «verde» dentro de
   «esverdeado» de outra maneira. Traduz-se cada um para a classe que o Python
   usa (as letras e os algarismos do Unicode, e o _; os espaços do
   str.isspace(), que não são os do \s do JavaScript: o \uFEFF não conta, o
   \x1c-\x1f conta), com o i e o u. O [\s\S] é «qualquer carácter» nos dois. */
const PY_PALAVRA = '\\p{L}\\p{N}_';
const PY_ESPACOS = '\\t\\n\\x0B\\x0C\\r\\x1C-\\x1F \\x85\\xA0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000';
export function doPython(src) {
  let out = '';
  let classe = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!classe && src.startsWith('[\\s\\S]', i)) { out += '[\\s\\S]'; i += 5; continue; }
    if (c === '\\') {
      const n = src[++i];
      if (n === undefined) throw new Error('doPython: o padrão acaba numa barra');
      if (classe) {
        if (n === 'w') out += PY_PALAVRA;
        else if (n === 's') out += PY_ESPACOS;
        else if (n === 'd') out += '\\p{Nd}';
        else if ('WSDbB'.includes(n)) throw new Error(`doPython: \\${n} dentro de uma classe não se traduz`);
        else out += `\\${n}`;
      } else if (n === 'w') out += `[${PY_PALAVRA}]`;
      else if (n === 'W') out += `[^${PY_PALAVRA}]`;
      else if (n === 's') out += `[${PY_ESPACOS}]`;
      else if (n === 'S') out += `[^${PY_ESPACOS}]`;
      else if (n === 'd') out += '\\p{Nd}';
      else if (n === 'D') out += '\\P{Nd}';
      else if (n === 'b') out += `(?:(?<=[${PY_PALAVRA}])(?![${PY_PALAVRA}])|(?<![${PY_PALAVRA}])(?=[${PY_PALAVRA}]))`;
      else if (n === 'B') out += `(?:(?<=[${PY_PALAVRA}])(?=[${PY_PALAVRA}])|(?<![${PY_PALAVRA}])(?![${PY_PALAVRA}]))`;
      else out += `\\${n}`;
      continue;
    }
    if (!classe && c === '[') {
      classe = true; out += c;
      if (src[i + 1] === '^') { out += '^'; i++; }
      if (src[i + 1] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (classe && c === ']') { classe = false; out += c; continue; }
    if (classe && c === '[') { out += '\\['; continue; }
    out += c;
  }
  if (classe) throw new Error('doPython: classe por fechar');
  return new RegExp(out, 'iu');
}
let termosJs = null;
const regrasDosTermos = () => (termosJs ??= TERMOS.map(([p, nome, remedio]) => ({ re: doPython(p), nome, remedio })));

/**
 * OS TERMOS NUM TEXTO, como o termos.py os acha (re.search: o primeiro de cada
 * regra). → [{ regra (o índice), nome, remedio, inicio, fim, trecho }]
 */
export function termosEm(texto) {
  if (typeof texto !== 'string' || !texto) return [];
  const out = [];
  regrasDosTermos().forEach((r, i) => {
    const m = r.re.exec(texto);
    if (!m) return;
    const trecho = texto.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\n/g, ' ').trim();
    out.push({ regra: i, nome: r.nome, remedio: r.remedio, inicio: m.index, fim: m.index + m[0].length, achado: m[0], trecho });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Ler                                                                 */
/* ------------------------------------------------------------------ */

/* Um ficheiro de dados: { obj } ou { problema } (que não existe, que não se
   lê, que não é um objecto — e aí o site não se consegue gerar). */
function lerFicheiro(f, v) {
  const ficheiro = FICHEIROS[f];
  const ecra = ECRAS[f];
  const parar = (regra, mensagem) => ({ problema: { classe: 'bloqueia', chave: `${f}:ficheiro:${regra}`, ficheiro, ecra, mensagem } });
  if (v === null) return parar('falta', `O ficheiro ${ficheiro} não existe: o site não se consegue gerar sem ele. Só o Renato o pode corrigir.`);
  let obj = v;
  if (typeof v === 'string') {
    try { obj = JSON.parse(v); } catch { return parar('json', `O ficheiro ${ficheiro} ficou mal escrito (não se consegue ler): o site não se consegue gerar. Só o Renato o pode corrigir.`); }
  }
  if (!eObjecto(obj)) return parar('forma', `O ficheiro ${ficheiro} não tem a forma de sempre: o site não se consegue gerar. Só o Renato o pode corrigir.`);
  return { obj };
}

/* ------------------------------------------------------------------ */
/* De quem é cada campo (as chaves e os ecrãs)                         */
/* ------------------------------------------------------------------ */

/* A IDENTIDADE DE UM ITEM NUMA LISTA, para a chave dos problemas: o nome (ou o
   título, o identificador, o caminho da fotografia), e não a posição. */
function identidade(f, lista, item, i) {
  const t = (k) => (eObjecto(item) && typeof item[k] === 'string' && item[k].trim() ? item[k].trim() : null);
  let v = null;
  if (f === 'lavagens') v = t('nome');
  else if (f === 'promocoes') v = t('titulo');
  else if (f === 'servicos') v = lista === 'fotos' ? t('nome') : (t('id') ?? t('titulo'));
  else if (f === 'trabalhos') v = t('img');
  return v ?? `#${i + 1}`;
}
/**
 * A IDENTIDADE DOS ITENS DE UMA LISTA, para quem junta duas gravações ao mesmo
 * tempo (o painel funde item a item só quando os itens são os mesmos, pela
 * mesma ordem, dos três lados): o nome de cada preço, o título de cada
 * campanha, o identificador de cada serviço, o caminho de cada fotografia.
 *   f       o ficheiro ('lavagens'…)
 *   partes  o caminho da lista: ['itens'], ['itens', 2, 'fotos'], ['horario']
 * → (item) => texto (o horário não tem: vale a posição), ou null se a lista
 *   se junta inteira (os endereços antigos, os dias).
 */
export function identidadeDaLista(f, partes) {
  const c = partes.map((p) => (typeof p === 'number' ? '#' : p)).join('.');
  const campo = { 'lavagens:itens': 'nome', 'promocoes:itens': 'titulo', 'servicos:itens': 'id', 'servicos:itens.#.fotos': 'nome', 'trabalhos:items': 'img' }[`${f}:${c}`];
  if (campo) return (x) => (eObjecto(x) && typeof x[campo] === 'string' ? x[campo] : null);
  if (f === 'site' && c === 'horario') return () => '';
  return null;
}
/** O nome de um item, como o dono o conhece (os ecrãs e as mensagens). */
export const nomeDeItem = (f, item, i) => nomeDoItem(f, item, i);
/* O nome com que o dono conhece o item, para o ecrã. */
function nomeDoItem(f, item, i) {
  const t = (k) => (eObjecto(item) && typeof item[k] === 'string' && item[k].trim() ? item[k].trim() : '');
  if (f === 'lavagens') return t('nome') || `Serviço n.º ${i + 1}`;
  if (f === 'promocoes') return t('titulo') || `Campanha n.º ${i + 1}`;
  if (f === 'servicos') return t('titulo') || t('id') || `Serviço n.º ${i + 1}`;
  if (f === 'trabalhos') return t('cap') || `Fotografia n.º ${i + 1}`;
  return `n.º ${i + 1}`;
}
const ecraDoItem = (f, item, i) => `${ECRAS[f]} › ${nomeDoItem(f, item, i)}`;
const ecraDoHead = (f) => `${ECRAS[f]} › ${f === 'trabalhos' ? 'Títulos' : 'Títulos da secção'}`;
const ecraDaParte = (chave) => `${ECRAS.site} › ${parteDoSite(chave)?.[1] ?? chave}`;

/**
 * O ECRÃ E A CHAVE DE UM CAMPO QUALQUER (os termos procuram em todos):
 *   f, obj   o ficheiro e o seu objecto
 *   partes   o caminho do campo ['itens', 3, 'inclui']
 * → { ecra, campo: 'itens.3.inclui', id: 'itens{Lavagem exterior}.inclui', servico? }
 */
function deQuem(f, obj, partes) {
  const campo = partes.join('.');
  const id = [];
  let o = obj;
  let ecra = ECRAS[f];
  let servico;
  for (let k = 0; k < partes.length; k++) {
    const p = partes[k];
    if (typeof p === 'number') {
      const lista = partes[k - 1];
      const item = Array.isArray(o) ? o[p] : undefined;
      id.push(`{${identidade(f, lista, item, p)}}`);
      if (k === 1 && ['itens', 'items'].includes(lista)) {
        ecra = ecraDoItem(f, item, p);
        if (f === 'servicos' && eObjecto(item) && typeof item.id === 'string') servico = item.id;
      }
      o = item;
      continue;
    }
    id.push(k ? `.${p}` : p);
    if (k === 0) {
      if (f === 'site') ecra = ecraDaParte(p);
      else if (p === 'head') ecra = ecraDoHead(f);
    }
    o = eObjecto(o) ? o[p] : undefined;
  }
  return { ecra, campo, id: id.join(''), ...(servico !== undefined ? { servico } : {}) };
}

/* ------------------------------------------------------------------ */
/* As regras                                                           */
/* ------------------------------------------------------------------ */

/* Um acumulador de problemas de um ficheiro. */
function caderno(f) {
  const out = [];
  const ficheiro = FICHEIROS[f];
  const juntar = (classe, chave, ecra, mensagem, extra = {}) => out.push({ classe, chave: `${f}:${chave}`, ficheiro, ecra, mensagem, ...extra });
  return { out, juntar };
}

/* Os campos de texto de um objecto: um valor que não é texto (um número, uma
   lista, de um commit à mão) diz-se; um texto comprido de mais, também. */
function conferirTextos(juntar, o, campos, { prefixo, chave, ecra, extra = {} }) {
  for (const [k, max, rotulo] of campos) {
    const v = o[k];
    if (ausente(v)) continue;
    const campo = `${prefixo}${k}`;
    if (typeof v !== 'string') { juntar('avisa', `${chave}:${k}:tipo`, ecra, `«${rotulo}» não está escrito como texto: escreva-o outra vez.`, { campo, ...extra }); continue; }
    if (max && v.length > max) juntar('avisa', `${chave}:${k}:comprido`, ecra, `«${rotulo}» tem ${v.length} caracteres: no máximo ${max}.`, { campo, ...extra });
  }
}

/* OS TÍTULOS DE UMA SECÇÃO (etiqueta, título, subtítulo). O app.js só os
   escreve quando têm texto (aplicarHead): um título apagado deixa no site o
   que lá estava. */
function conferirHead(juntar, f, h, { campo = 'head', ecra = ecraDoHead(f), chave = 'head', visivel = true } = {}) {
  if (ausente(h)) return;
  if (!eObjecto(h)) { juntar('bloqueia', `${chave}:forma`, ecra, 'Os títulos da secção não têm a forma de sempre: o site não se consegue gerar. Só o Renato o pode corrigir.', { campo }); return; }
  conferirTextos(juntar, h, [['etiqueta', TAMANHOS.etiqueta, 'Etiqueta'], ['titulo', TAMANHOS.tituloSeccao, 'Título'], ['lead', TAMANHOS.lead, 'Subtítulo']], { prefixo: `${campo}.`, chave, ecra });
  if (visivel && (ausente(h.titulo) || (typeof h.titulo === 'string' && !h.titulo.trim()))) {
    juntar('avisa', `${chave}:titulo:vazio`, ecra, 'O título da secção está vazio: o site continua a mostrar o que lá estava. Escreva o título que quer.', { campo: `${campo}.titulo` });
  }
}

/* UMA FOTOGRAFIA NUM CAMPO: que existe (no site aparecia partida), e que o
   nome não estraga o site. `existe` ausente: não se confere. */
function conferirFoto(juntar, valor, { pasta, campo, chave, ecra, existe, extra = {}, rotulo = 'A fotografia' }) {
  if (ausente(valor) || valor === '') return;
  if (typeof valor !== 'string') { juntar('avisa', `${chave}:tipo`, ecra, `${rotulo} não está escrita como um caminho: escolha-a outra vez.`, { campo, ...extra }); return; }
  if (!valor.trim()) return;
  if (valor.length > TAMANHOS.caminhoFoto) { juntar('avisa', `${chave}:comprido`, ecra, `${rotulo} tem um caminho comprido de mais: escolha-a outra vez.`, { campo, ...extra }); return; }
  if (!existe) return;
  const e = fotoNoSite(valor, pasta, existe);
  if (e.estado === 'falta') juntar('avisa', `${chave}:falta`, ecra, `${rotulo} já não existe na biblioteca: no site aparece partida. Escolha outra (ou tire-a).`, { campo, ...extra });
}

/* --- Preços das lavagens (data/lavagens.json) --------------------------------- */
export function problemasDasLavagens(o, { existe = null } = {}) {
  const f = 'lavagens';
  const { out, juntar } = caderno(f);
  conferirHead(juntar, f, o.head);
  if (!ausente(o.itens) && !Array.isArray(o.itens)) {
    juntar('bloqueia', 'itens:forma', ECRAS[f], 'A lista dos serviços e preços não tem a forma de sempre: o site não se consegue gerar. Só o Renato o pode corrigir.', { campo: 'itens' });
    return out;
  }
  const itens = Array.isArray(o.itens) ? o.itens : [];
  if (itens.length > TAMANHOS.itensLavagens) juntar('avisa', 'itens:muitos', ECRAS[f], `Há ${itens.length} serviços na tabela: no máximo ${TAMANHOS.itensLavagens}.`, { campo: 'itens' });
  itens.forEach((x, i) => {
    if (!x) return;   // o prerender.py e o app.js saltam-nos
    const quem = `item:${identidade(f, 'itens', x, i)}`;
    const ecra = ecraDoItem(f, x, i);
    const campo = (k) => `itens.${i}.${k}`;
    if (!eObjecto(x)) { juntar('bloqueia', `${quem}:forma`, ecra, 'Uma linha da tabela não tem a forma de sempre: o site não se consegue gerar. Só o Renato a pode corrigir.', { campo: `itens.${i}` }); return; }
    conferirTextos(juntar, x, [['nome', TAMANHOS.nomeLavagem, 'Nome do serviço'], ['categoria', 40, 'Categoria'], ['inclui', TAMANHOS.inclui, 'O que inclui'],
      ['duracao', TAMANHOS.duracao, 'Quanto tempo demora'], ['preco', TAMANHOS.preco, 'Preço para ligeiros'], ['preco_grande', TAMANHOS.preco, 'Preço para SUV e carrinhas'],
      ['unidade', TAMANHOS.unidade, 'A que se refere o preço']], { prefixo: `itens.${i}.`, chave: quem, ecra });
    const nome = textoDe(x.nome);
    if (nome !== null && !nome.trim()) juntar('neutraliza', `${quem}:sem_nome`, ecra, 'Este serviço não tem nome: não aparece no site.', { campo: campo('nome'), efeito: 'esconder' });
    const cat = textoDe(x.categoria);
    if (cat !== null && !CATEGORIAS_LAVAGENS.includes(cat)) {
      juntar('avisa', `${quem}:categoria`, ecra, cat.trim() ? `A categoria «${cat}» não é uma das do site (${CATEGORIAS_LAVAGENS.join(', ')}): aparece com a ilustração das lavagens e num filtro à parte.` : 'Escolha a categoria (Lavagens, Extras ou Interior).', { campo: campo('categoria') });
    }
    const preco = textoDe(x.preco); const grande = textoDe(x.preco_grande);
    if (preco && preco.trim() && !temDigito(preco)) juntar('avisa', `${quem}:preco:numero`, ecra, `O preço («${preco.trim()}») não tem nenhum número: o site escreve-o tal e qual, com «+ IVA» ao lado. Deixe vazio para aparecer «Sob consulta».`, { campo: campo('preco') });
    if (grande && grande.trim()) {
      if (!temDigito(grande)) juntar('avisa', `${quem}:preco_grande:numero`, ecra, `O preço de SUV e carrinhas («${grande.trim()}») não tem nenhum número.`, { campo: campo('preco_grande') });
      else if (!(preco && preco.trim())) juntar('avisa', `${quem}:preco_grande:sozinho`, ecra, 'O preço de SUV e carrinhas só aparece com o preço de ligeiros preenchido: sem ele, o site mostra «Sob consulta». Escreva os dois, ou só o de ligeiros.', { campo: campo('preco_grande') });
    }
    conferirFoto(juntar, x.foto, { pasta: 'lavagens', campo: campo('foto'), chave: `${quem}:foto`, ecra, existe });
  });
  return out;
}

/* --- Promoções (data/promocoes.json) -------------------------------------------
   O que o app.js faz (valida): sem título não aparece; antes do início e
   depois do fim também não; com «saldos» ou «liquidação» no texto também não
   (e o termos.py trava a publicação); um desconto sem a percentagem e sem o
   preço mais baixo dos 30 dias anteriores não aparece (DL 70/2007, alterado
   pelo DL 109-G/2021); uma oferta sem dizer o que se oferece também não. */
export function problemasDasPromocoes(o, { hoje = hojeEmLisboa() } = {}) {
  const f = 'promocoes';
  const { out, juntar } = caderno(f);
  conferirHead(juntar, f, o.head);
  if (!ausente(o.itens) && !Array.isArray(o.itens)) {
    juntar('bloqueia', 'itens:forma', ECRAS[f], 'A lista das campanhas não tem a forma de sempre: a secção das promoções não aparece. Só o Renato a pode corrigir.', { campo: 'itens' });
    return out;
  }
  const itens = Array.isArray(o.itens) ? o.itens : [];
  if (itens.length > TAMANHOS.itensPromocoes) juntar('avisa', 'itens:muitas', ECRAS[f], `Há ${itens.length} campanhas: no máximo ${TAMANHOS.itensPromocoes}.`, { campo: 'itens' });
  itens.forEach((x, i) => {
    if (!x) return;
    const quem = `item:${identidade(f, 'itens', x, i)}`;
    const ecra = ecraDoItem(f, x, i);
    const campo = (k) => `itens.${i}.${k}`;
    if (!eObjecto(x)) { juntar('bloqueia', `${quem}:forma`, ecra, 'Uma campanha não tem a forma de sempre: as promoções não aparecem. Só o Renato a pode corrigir.', { campo: `itens.${i}` }); return; }
    conferirTextos(juntar, x, [['titulo', TAMANHOS.tituloPromocao, 'O que está em campanha'], ['tipo', 20, 'Tipo de campanha'], ['percentagem', TAMANHOS.percentagem, 'Desconto (%)'],
      ['antes', TAMANHOS.antes, 'Preço mais baixo dos últimos 30 dias'], ['oferta', TAMANHOS.oferta, 'O que está incluído'], ['inicio', 10, 'Começa em'], ['fim', 10, 'Acaba em'],
      ['condicoes', TAMANHOS.condicoes, 'Condições']], { prefixo: `itens.${i}.`, chave: quem, ecra });
    const esconder = (regra, mensagem, k) => juntar('neutraliza', `${quem}:${regra}`, ecra, mensagem, { campo: campo(k), efeito: 'esconder' });
    const titulo = textoDe(x.titulo);
    if (titulo !== null && !titulo.trim()) esconder('sem_titulo', 'Esta campanha não diz o que está em campanha: não aparece no site.', 'titulo');
    const tipo = textoDe(x.tipo);
    if (tipo !== null && !Object.hasOwn(TIPOS_PROMOCAO, tipo)) juntar('avisa', `${quem}:tipo`, ecra, 'Escolha o tipo de campanha (desconto, ou oferta de um extra).', { campo: campo('tipo') });
    if (tipo === 'desconto') {
      const pct = textoDe(x.percentagem);
      if (pct !== null && !pct.trim()) esconder('sem_percentagem', 'Um desconto sem a percentagem não aparece no site: escreva-a (só o número, ex.: 20).', 'percentagem');
      else if (pct !== null && !/^(?:[1-9]\d?)\s*%?$/.test(pct.trim())) juntar('avisa', `${quem}:percentagem`, ecra, `O desconto («${pct.trim()}») tem de ser só o número, de 1 a 99 (ex.: 20).`, { campo: campo('percentagem') });
      const antes = textoDe(x.antes);
      if (antes !== null && !antes.trim()) esconder('sem_antes', 'Um desconto sem o preço mais baixo dos 30 dias anteriores não aparece no site: a lei obriga a mostrá-lo (DL 70/2007).', 'antes');
      else if (antes && !temDigito(antes)) juntar('avisa', `${quem}:antes:numero`, ecra, `O preço anterior («${antes.trim()}») não tem nenhum número.`, { campo: campo('antes') });
    } else if (tipo !== null) {
      const oferta = textoDe(x.oferta);
      if (oferta !== null && !oferta.trim()) esconder('sem_oferta', 'Uma oferta que não diz o que se oferece não aparece no site: escreva o que está incluído.', 'oferta');
    }
    const ini = textoDe(x.inicio); const fim = textoDe(x.fim);
    if (ini && ini.trim() && !dataValida(ini.trim())) juntar('avisa', `${quem}:inicio:data`, ecra, 'A data de início não está certa: escolha-a outra vez.', { campo: campo('inicio') });
    if (fim !== null && !fim.trim()) juntar('avisa', `${quem}:fim:vazio`, ecra, 'Escolha o último dia da campanha: sem ele, fica no site para sempre.', { campo: campo('fim') });
    else if (fim && !dataValida(fim.trim())) juntar('avisa', `${quem}:fim:data`, ecra, 'A data de fim não está certa: escolha-a outra vez.', { campo: campo('fim') });
    const di = ini && dataValida(ini.trim()) ? ini.trim() : ''; const df = fim && dataValida(fim.trim()) ? fim.trim() : '';
    if (di && df && di > df) juntar('avisa', `${quem}:datas`, ecra, 'A campanha acaba antes de começar: nunca aparece no site.', { campo: campo('fim') });
    else if (df && df < hoje) juntar('avisa', `${quem}:acabou`, ecra, `Acabou a ${diaPorExtenso(df)}: já não aparece no site. Pode apagá-la (ou mudar as datas, se voltar a fazê-la).`, { campo: campo('fim'), lembrete: true });
    else if (di && di > hoje) juntar('avisa', `${quem}:comeca`, ecra, `Começa a ${diaPorExtenso(di)}: até lá não aparece no site.`, { campo: campo('inicio'), lembrete: true });
  });
  return out;
}

/* --- Serviços (data/servicos.json) ---------------------------------------------- */
export function problemasDosServicos(o, { existe = null } = {}) {
  const f = 'servicos';
  const { out, juntar } = caderno(f);
  conferirHead(juntar, f, o.head);
  if (!ausente(o.itens) && !Array.isArray(o.itens)) {
    juntar('bloqueia', 'itens:forma', ECRAS[f], 'A lista dos serviços não tem a forma de sempre: o site não se consegue gerar. Só o Renato a pode corrigir.', { campo: 'itens' });
    return out;
  }
  const itens = Array.isArray(o.itens) ? o.itens : [];
  if (!itens.length) juntar('avisa', 'itens:vazia', ECRAS[f], 'Não há serviços: a secção dos serviços fica vazia no site.', { campo: 'itens' });
  if (itens.length > TAMANHOS.itensServicos) juntar('avisa', 'itens:muitos', ECRAS[f], `Há ${itens.length} serviços: no máximo ${TAMANHOS.itensServicos}.`, { campo: 'itens' });
  /* Os identificadores e os endereços antigos são todos endereços na mesma
     página (#servico-<x>): dois iguais levam ao primeiro. */
  const vistos = new Map();
  itens.forEach((x, i) => {
    if (!eObjecto(x)) return;
    for (const a of [x.id, ...(Array.isArray(x.alias) ? x.alias : [])]) if (typeof a === 'string' && a) vistos.set(a, (vistos.get(a) ?? 0) + 1);
  });
  itens.forEach((x, i) => {
    const quem = `servico:${identidade(f, 'itens', x, i)}`;
    const ecra = ecraDoItem(f, x, i);
    const servico = eObjecto(x) && typeof x.id === 'string' ? x.id : undefined;
    const extra = servico !== undefined ? { servico } : {};
    const campo = (k) => `itens.${i}.${k}`;
    /* O prerender.py lê x['titulo'] de cada um para os dados estruturados:
       sem a chave (ou sem ser um objecto), rebenta. */
    if (!eObjecto(x)) { juntar('bloqueia', `${quem}:forma`, ecra, 'Um serviço não tem a forma de sempre: o site não se consegue gerar. Só o Renato o pode corrigir.', { campo: `itens.${i}` }); return; }
    if (!tem(x, 'titulo')) { juntar('bloqueia', `${quem}:titulo:falta`, ecra, 'Este serviço não tem o campo do nome: o site não se consegue gerar. Só o Renato o pode corrigir.', { campo: campo('titulo'), ...extra }); }
    conferirTextos(juntar, x, [['id', 60, 'Identificador'], ['titulo', TAMANHOS.tituloServico, 'Nome do serviço'], ['descricao', TAMANHOS.descricao, 'Descrição'], ['tempo', TAMANHOS.tempo, 'Tempo médio'],
      ['legenda_foto', TAMANHOS.legenda, 'Legenda da fotografia de capa'], ['detalhe', TAMANHOS.detalhe, 'Texto do detalhe']], { prefixo: `itens.${i}.`, chave: quem, ecra, extra });
    if (tem(x, 'titulo') && typeof x.titulo === 'string' && !x.titulo.trim()) juntar('avisa', `${quem}:titulo:vazio`, ecra, 'Este serviço não tem nome: o cartão aparece sem título.', { campo: campo('titulo'), ...extra });
    const id = textoDe(x.id);
    if (id !== null) {
      if (!id) juntar('avisa', `${quem}:id:vazio`, ecra, 'Este serviço não tem identificador (o fim do endereço #servico-…): fale com o Renato.', { campo: campo('id'), ...extra });
      else if (!RE_ID.test(id)) juntar('avisa', `${quem}:id:forma`, ecra, `O identificador «${id}» não é só letras minúsculas, algarismos e hífens: o endereço do serviço pode não funcionar. Fale com o Renato.`, { campo: campo('id'), ...extra });
      else if ((vistos.get(id) ?? 0) > 1) juntar('avisa', `${quem}:id:repetido`, ecra, `O identificador «${id}» é igual ao de outro serviço (ou a um endereço antigo): o endereço leva ao primeiro. Fale com o Renato.`, { campo: campo('id'), ...extra });
    }
    /* O app.js faz (s.alias || []).map e (s.fotos …).map: outra coisa que não
       uma lista rebenta o desenho de TODOS os serviços. */
    for (const k of ['alias', 'fotos']) {
      if (!ausente(x[k]) && x[k] !== '' && !Array.isArray(x[k])) juntar('bloqueia', `${quem}:${k}:forma`, ecra, `${k === 'alias' ? 'Os endereços antigos' : 'As fotografias do detalhe'} deste serviço não têm a forma de sempre: a secção dos serviços não aparece. Só o Renato a pode corrigir.`, { campo: campo(k), ...extra });
    }
    if (Array.isArray(x.alias)) {
      x.alias.forEach((a, k) => {
        if (typeof a !== 'string' || !RE_ID.test(a)) juntar('avisa', `${quem}:alias:${typeof a === 'string' ? a : k}`, ecra, 'Um endereço antigo deste serviço não está bem escrito: fale com o Renato.', { campo: campo('alias'), ...extra });
        else if ((vistos.get(a) ?? 0) > 1) juntar('avisa', `${quem}:alias:${a}:repetido`, ecra, `O endereço antigo «${a}» é igual a outro: leva ao primeiro. Fale com o Renato.`, { campo: campo('alias'), ...extra });
      });
    }
    conferirFoto(juntar, x.foto, { pasta: 'trabalhos', campo: campo('foto'), chave: `${quem}:foto`, ecra, existe, extra, rotulo: 'A fotografia de capa' });
    if (Array.isArray(x.fotos)) {
      if (x.fotos.length > TAMANHOS.fotosServico) juntar('avisa', `${quem}:fotos:muitas`, ecra, `O carrossel tem ${x.fotos.length} fotografias: no máximo ${TAMANHOS.fotosServico}.`, { campo: campo('fotos'), ...extra });
      const repetidas = new Set();
      x.fotos.forEach((g, j) => {
        const quemF = `${quem}:foto:${identidade(f, 'fotos', g, j)}`;
        const cg = `itens.${i}.fotos.${j}`;
        if (!eObjecto(g)) { juntar('avisa', `${quemF}:forma`, ecra, `A ${j + 1}.ª fotografia do carrossel não tem a forma de sempre: não aparece. Tire-a e junte-a outra vez.`, { campo: cg, ...extra }); return; }
        conferirTextos(juntar, g, [['legenda', TAMANHOS.legenda, 'Legenda']], { prefixo: `${cg}.`, chave: quemF, ecra, extra });
        const n = textoDe(g.nome);
        if (n !== null && !n.trim()) { juntar('avisa', `${quemF}:vazia`, ecra, `A ${j + 1}.ª fotografia do carrossel não tem fotografia: escolha uma, ou tire a linha.`, { campo: `${cg}.nome`, ...extra }); return; }
        conferirFoto(juntar, g.nome, { pasta: 'trabalhos', campo: `${cg}.nome`, chave: quemF, ecra, existe, extra, rotulo: `A ${j + 1}.ª fotografia do carrossel` });
        const b = typeof g.nome === 'string' ? baseDaFoto(g.nome) : '';
        if (b && repetidas.has(b)) juntar('avisa', `${quemF}:repetida`, ecra, `A ${j + 1}.ª fotografia do carrossel já lá está: aparecia duas vezes.`, { campo: `${cg}.nome`, ...extra });
        if (b) repetidas.add(b);
      });
    }
  });
  return out;
}

/* --- Página (data/site.json) -------------------------------------------------------- */

/* O re do Python que o prerender.py usa no código postal e nas horas: \d e
   \s são os do Unicode, e o strip() tira os espaços do str.isspace(). */
const espacoPy = (c) => /[\t\n\x0B\x0C\r\x1C-\x1F \x85\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/.test(c);
function stripPy(s) {
  let a = 0; let b = s.length;
  while (a < b && espacoPy(s[a])) a++;
  while (b > a && espacoPy(s[b - 1])) b--;
  return s.slice(a, b);
}
/* re.match(r'^(\d{4}-\d{3})\s+(\S.*)$', linha2) — o «.» do Python não apanha o \n. */
const RE_CP = /^(\p{Nd}{4}-\p{Nd}{3})[\t\n\x0B\x0C\r\x1C-\x1F \x85\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+([^\t\n\x0B\x0C\r\x1C-\x1F \x85\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000][^\n]*)$/u;
export const codigoPostalComoOPrerender = (linha2) => typeof linha2 === 'string' && RE_CP.test(stripPy(linha2));
/* re.match(r'^([01]\d|2[0-3]):[0-5]\d$', h) */
const RE_HORA = /^(?:[01]\p{Nd}|2[0-3]):[0-5]\p{Nd}$/u;
export const horaComoOPrerender = (h) => typeof h === 'string' && RE_HORA.test(h) && /^[0-9:]+$/.test(h);
/* Para o painel: a hora que o prerender aceita E que o site mostra bem (só os
   algarismos de 0 a 9). */
export const horaValida = (h) => typeof h === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(h);

export function problemasDoSite(o, { existe = null, listarPasta = null } = {}) {
  const f = 'site';
  const { out, juntar } = caderno(f);
  const secao = (k) => {
    const v = o[k];
    if (ausente(v)) return {};
    if (!eObjecto(v)) { juntar('bloqueia', `${k}:forma`, ecraDaParte(k), `«${parteDoSite(k)?.[1] ?? k}» não tem a forma de sempre: o site não se consegue gerar. Só o Renato o pode corrigir.`, { campo: k }); return null; }
    return v;
  };

  /* Contactos ----------------------------------------------------------- */
  const c = secao('contactos');
  if (c) {
    const ecra = ecraDaParte('contactos');
    const campo = (k) => `contactos.${k}`;
    conferirTextos(juntar, c, [['telefone', TAMANHOS.telefone, 'Telefone'], ['custo_chamada', TAMANHOS.custoChamada, 'Indicação do custo da chamada'], ['email', TAMANHOS.email, 'Email'],
      ['morada_linha1', TAMANHOS.morada, 'Morada (rua e número)'], ['morada_linha2', TAMANHOS.codigoPostalLocalidade, 'Morada (código postal e localidade)'],
      ['instagram_url', TAMANHOS.url, 'Link do Instagram'], ['instagram_handle', TAMANHOS.instagram, 'Nome do Instagram'], ['facebook_url', TAMANHOS.url, 'Link do Facebook'], ['maps_url', TAMANHOS.url, 'Link do Google Maps']],
    { prefixo: 'contactos.', chave: 'contactos', ecra });
    /* O prerender.py faz '+' + telefone_intl: um número escrito como número rebenta. */
    if (!ausente(c.telefone_intl) && c.telefone_intl !== '' && typeof c.telefone_intl !== 'string') juntar('bloqueia', 'contactos:telefone_intl:tipo', ecra, 'O número internacional não está escrito como texto: o site não se consegue gerar. Escreva o telefone outra vez.', { campo: campo('telefone') });
    const tel = textoDe(c.telefone); const email = textoDe(c.email);
    const t = tel === null ? undefined : lerTelefone(tel);
    if (!limpo(tel) && !limpo(email)) {
      juntar('bloqueia', 'contactos:sem_contacto', ecra, 'O site ficava sem telefone e sem email: a lei pede um contacto (DL 7/2004, art. 10.º), e os botões «Ligar» e «WhatsApp» precisam do telefone.', { campo: campo('telefone') });
    } else if (!limpo(tel)) {
      juntar('avisa', 'contactos:telefone:vazio', ecra, 'Sem telefone, os botões «Ligar agora» e «WhatsApp» ficam sem número. Escreva o telefone da oficina.', { campo: campo('telefone') });
    } else if (t === undefined) {
      juntar('avisa', 'contactos:telefone:forma', ecra, `O telefone («${limpo(tel)}») não é um número português (9 algarismos, a começar por 2 ou por 91, 92, 93 ou 96).`, { campo: campo('telefone') });
    } else if (t) {
      const intl = textoDe(c.telefone_intl);
      if (intl !== null && intl !== t.intl) juntar('avisa', 'contactos:telefone_intl:outro', ecra, `Os botões de ligar e do WhatsApp vão para outro número (+${intl || '…'}) e não para ${t.texto}. Escreva o telefone outra vez: o painel acerta os dois.`, { campo: campo('telefone') });
      const custo = textoDe(c.custo_chamada);
      if (custo !== null && !custo.trim()) juntar('avisa', 'contactos:custo_chamada:vazio', ecra, `A lei obriga a dizer ao lado do número o custo da chamada (DL 59/2021): ${CUSTO_CHAMADA[t.rede]}.`, { campo: campo('custo_chamada') });
      else if (custo && !custo.toLowerCase().includes(t.rede === 'movel' ? 'móvel' : 'fixa')) juntar('avisa', 'contactos:custo_chamada:rede', ecra, `O custo da chamada não bate com o número: ${t.texto} é de rede ${t.rede === 'movel' ? 'móvel' : 'fixa'} — ${CUSTO_CHAMADA[t.rede]}.`, { campo: campo('custo_chamada') });
    }
    if (limpo(email) && !emailValido(limpo(email))) juntar('avisa', 'contactos:email:forma', ecra, 'O email não parece estar bem escrito (sem acentos nem espaços, ex.: nome@gmail.com).', { campo: campo('email') });
    if (!limpo(email) && email !== null) juntar('avisa', 'contactos:email:vazio', ecra, 'A lei pede um email de contacto no site (DL 7/2004, art. 10.º): escreva-o assim que o tiver.', { campo: campo('email'), lembrete: true });
    const m1 = textoDe(c.morada_linha1);
    if (m1 !== null && !m1.trim()) juntar('bloqueia', 'contactos:morada_linha1:vazio', ecra, 'Falta a morada (rua e número): a lei obriga a mostrá-la (DL 7/2004, art. 10.º).', { campo: campo('morada_linha1') });
    const m2 = c.morada_linha2;
    /* O prerender.py pára sem «0000-000 Localidade» (os dados estruturados). */
    if (ausente(m2) || (typeof m2 === 'string' && !codigoPostalComoOPrerender(m2))) {
      juntar('bloqueia', 'contactos:morada_linha2:forma', ecra, `A morada (código postal e localidade) tem de ser o código postal e depois a localidade, ex.: 3700-169 São João da Madeira${limpo(m2) ? ` (está «${limpo(m2)}»)` : ''}.`, { campo: campo('morada_linha2') });
    }
    const ig = textoDe(c.instagram_url);
    if (ig !== null && !ig.trim()) juntar('avisa', 'contactos:instagram_url:vazio', ecra, 'Sem o link do Instagram, os ícones do Instagram continuam a levar ao endereço antigo. Escreva o link da página.', { campo: campo('instagram_url') });
    else if (ig && !urlHttps(ig.trim())) juntar('avisa', 'contactos:instagram_url:forma', ecra, 'O link do Instagram tem de ser o endereço completo, a começar por https://.', { campo: campo('instagram_url') });
    if (ig && ig.trim() && textoDe(c.instagram_handle) !== null && !limpo(c.instagram_handle)) juntar('avisa', 'contactos:instagram_handle:vazio', ecra, 'Escreva o nome do Instagram (ex.: @pokeauto2026): é o texto da ligação nos contactos.', { campo: campo('instagram_handle') });
    for (const [k, nome] of [['facebook_url', 'do Facebook'], ['maps_url', 'do Google Maps']]) {
      const v = textoDe(c[k]);
      if (v && v.trim() && !urlHttps(v.trim())) juntar('avisa', `contactos:${k}:forma`, ecra, `O link ${nome} tem de ser o endereço completo, a começar por https://.`, { campo: campo(k) });
    }
  }

  /* Horário ------------------------------------------------------------- */
  const h = o.horario;
  const ecraH = ecraDaParte('horario');
  if (!ausente(h) && h !== '' && !Array.isArray(h)) juntar('bloqueia', 'horario:forma', ecraH, 'O horário não tem a forma de sempre: o site não se consegue gerar. Só o Renato o pode corrigir.', { campo: 'horario' });
  if (Array.isArray(h)) {
    if (h.length > TAMANHOS.horario) juntar('avisa', 'horario:muitas', ecraH, `O horário tem ${h.length} linhas: no máximo ${TAMANHOS.horario}.`, { campo: 'horario' });
    h.forEach((b, i) => {
      const quem = `horario:${i + 1}`;
      const campo = (k) => `horario.${i}${k ? `.${k}` : ''}`;
      if (!eObjecto(b)) { juntar('bloqueia', `${quem}:forma`, ecraH, `A ${i + 1}.ª linha do horário não tem a forma de sempre: o site não se consegue gerar.`, { campo: campo('') }); return; }
      for (const k of ['abre', 'fecha']) {
        if (!ausente(b[k]) && b[k] !== '' && typeof b[k] !== 'string') juntar('bloqueia', `${quem}:${k}:tipo`, ecraH, `A ${i + 1}.ª linha do horário tem a hora de ${k === 'abre' ? 'abrir' : 'fechar'} escrita como número: o site não se consegue gerar. Escreva-a outra vez (ex.: 09:00).`, { campo: campo(k) });
      }
      let dias = b.dias;
      if (typeof dias === 'string') dias = [dias];
      if (!ausente(dias) && dias !== '' && !Array.isArray(dias)) { juntar('bloqueia', `${quem}:dias:forma`, ecraH, `Os dias da ${i + 1}.ª linha do horário não têm a forma de sempre.`, { campo: campo('dias') }); return; }
      dias = Array.isArray(dias) ? dias : [];
      const abre = typeof b.abre === 'string' ? stripPy(b.abre) : ''; const fecha = typeof b.fecha === 'string' ? stripPy(b.fecha) : '';
      if (!dias.length || !abre || !fecha) {
        juntar('avisa', `${quem}:incompleta`, ecraH, `A ${i + 1}.ª linha do horário está incompleta (${!dias.length ? 'sem dias' : !abre ? 'sem a hora de abrir' : 'sem a hora de fechar'}): não aparece no site. Complete-a ou tire-a.`, { campo: campo(!dias.length ? 'dias' : !abre ? 'abre' : 'fecha') });
        return;
      }
      for (const [k, v] of [['abre', abre], ['fecha', fecha]]) {
        if (!horaComoOPrerender(v)) juntar('bloqueia', `${quem}:${k}:forma`, ecraH, `A hora de ${k === 'abre' ? 'abrir' : 'fechar'} da ${i + 1}.ª linha («${v}») tem de ser HH:MM, de 00:00 a 23:59 (ex.: 09:00).`, { campo: campo(k) });
      }
      if (dias.some((d) => typeof d !== 'string' || !Object.hasOwn(DIAS, d))) juntar('avisa', `${quem}:dias:fora`, ecraH, `A ${i + 1}.ª linha do horário tem um dia que não existe: escolha os dias outra vez.`, { campo: campo('dias') });
      if (new Set(dias).size !== dias.length) juntar('avisa', `${quem}:dias:repetidos`, ecraH, `A ${i + 1}.ª linha do horário tem um dia repetido.`, { campo: campo('dias') });
      if (horaValida(abre) && horaValida(fecha) && abre >= fecha) juntar('avisa', `${quem}:horas`, ecraH, `Na ${i + 1}.ª linha do horário, fecha (${fecha}) antes de abrir (${abre}).`, { campo: campo('fecha') });
    });
  }

  /* Topo da página ------------------------------------------------------- */
  const hero = secao('hero');
  if (hero) {
    const ecra = ecraDaParte('hero');
    conferirTextos(juntar, hero, [['etiqueta', TAMANHOS.heroEtiqueta, 'Etiqueta pequena'], ['titulo', TAMANHOS.heroTitulo, 'Título grande'], ['destaque', TAMANHOS.heroTitulo, 'Palavra do título a dourado'],
      ['lead', TAMANHOS.heroLead, 'Texto de apresentação'], ['cta_principal', TAMANHOS.botao, 'Botão principal'], ['cta_secundario', TAMANHOS.botao, 'Botão secundário'], ['nota', TAMANHOS.nota, 'Frase pequena por baixo dos botões']],
    { prefixo: 'hero.', chave: 'hero', ecra });
    if (textoDe(hero.titulo) !== null && !limpo(hero.titulo)) juntar('avisa', 'hero:titulo:vazio', ecra, 'O título grande está vazio: o site continua a mostrar o que lá estava (é o título que mais conta no Google). Escreva-o.', { campo: 'hero.titulo' });
    for (const [k, nome] of [['cta_principal', 'O botão principal («Ligar agora»)'], ['cta_secundario', 'O botão secundário («WhatsApp»)']]) {
      if (textoDe(hero[k]) !== null && !limpo(hero[k])) juntar('avisa', `hero:${k}:vazio`, ecra, `${nome} fica sem texto. Escreva o que o botão diz.`, { campo: `hero.${k}` });
    }
    conferirFoto(juntar, hero.foto, { pasta: 'trabalhos', campo: 'hero.foto', chave: 'hero:foto', ecra, existe, rotulo: 'A fotografia de fundo' });
  }

  /* Faixa ------------------------------------------------------------------ */
  const faixa = secao('faixa');
  if (faixa) {
    const ecra = ecraDaParte('faixa');
    conferirTextos(juntar, faixa, [['texto', TAMANHOS.faixaTexto, 'Frase'], ['destaque', TAMANHOS.faixaDestaque, 'Parte da frase a itálico']], { prefixo: 'faixa.', chave: 'faixa', ecra });
    const tx = limpo(faixa.texto); const dq = limpo(faixa.destaque);
    if (dq && tx && !tx.toLowerCase().includes(dq.toLowerCase())) juntar('avisa', 'faixa:destaque:fora', ecra, `«${dq}» não está na frase: nada sai a itálico. Escreva uma parte da frase tal e qual.`, { campo: 'faixa.destaque', lembrete: true });
    conferirFoto(juntar, faixa.foto, { pasta: 'trabalhos', campo: 'faixa.foto', chave: 'faixa:foto', ecra, existe, rotulo: 'A fotografia da faixa' });
  }

  /* «Onde estamos» ----------------------------------------------------------- */
  const ch = o.contactos_head;
  if (!ausente(ch)) conferirHead(juntar, f, ch, { campo: 'contactos_head', ecra: ecraDaParte('contactos_head'), chave: 'contactos_head' });

  /* Rodapé -------------------------------------------------------------------- */
  if (!ausente(o.rodape_frase)) conferirTextos(juntar, o, [['rodape_frase', TAMANHOS.rodape, 'Frase do rodapé']], { prefixo: '', chave: 'rodape', ecra: ecraDaParte('rodape_frase') });

  /* Google ---------------------------------------------------------------------- */
  const seo = secao('seo');
  if (seo) {
    const ecra = ecraDaParte('seo');
    conferirTextos(juntar, seo, [['titulo', TAMANHOS.seoTitulo, 'Título da página'], ['descricao', TAMANHOS.seoDescricao, 'Descrição']], { prefixo: 'seo.', chave: 'seo', ecra });
    for (const [k, nome, max] of [['titulo', 'O título', GOOGLE.titulo], ['descricao', 'A descrição', GOOGLE.descricao]]) {
      const v = textoDe(seo[k]);
      if (v === null) continue;
      if (!v.trim()) juntar('avisa', `seo:${k}:vazio`, ecra, `${nome} está vazio: o Google continua a mostrar o que lá estava. Escreva-o.`, { campo: `seo.${k}` });
      else if (v.trim().length > max && v.length <= (k === 'titulo' ? TAMANHOS.seoTitulo : TAMANHOS.seoDescricao)) juntar('avisa', `seo:${k}:google`, ecra, `${nome} tem ${v.trim().length} caracteres: o Google costuma cortar a partir de ${max}.`, { campo: `seo.${k}`, lembrete: true });
    }
  }

  /* Partilha ------------------------------------------------------------------- */
  const og = secao('og');
  if (og) {
    const ecra = ecraDaParte('og');
    conferirTextos(juntar, og, [['titulo', TAMANHOS.ogTitulo, 'Título no cartão'], ['subtitulo', TAMANHOS.ogSubtitulo, 'Linha de serviços']], { prefixo: 'og.', chave: 'og', ecra });
    const v = og.foto;
    if (typeof v === 'string' && v.trim()) {
      if (v.length > TAMANHOS.caminhoFoto) juntar('avisa', 'og:foto:comprido', ecra, 'A fotografia do cartão tem um caminho comprido de mais: escolha-a outra vez.', { campo: 'og.foto' });
      else if (existe && fotoDoCartao(v, existe, listarPasta).estado === 'falta') juntar('avisa', 'og:foto:falta', ecra, 'A fotografia do cartão já não existe na biblioteca: o cartão sai com a da jante. Escolha outra.', { campo: 'og.foto' });
    } else if (!ausente(v) && typeof v !== 'string') juntar('avisa', 'og:foto:tipo', ecra, 'A fotografia do cartão não está escrita como um caminho: escolha-a outra vez.', { campo: 'og.foto' });
  }

  /* Dados legais ----------------------------------------------------------------- */
  const L = secao('legal');
  if (L) {
    const ecra = ecraDaParte('legal');
    conferirTextos(juntar, L, [['forma_juridica', 20, 'Forma jurídica'], ['nome_titular', TAMANHOS.nomeTitular, 'Nome completo do titular'], ['designacao_comercial', TAMANHOS.designacao, 'Designação comercial'],
      ['conservatoria', TAMANHOS.conservatoria, 'Conservatória'], ['matricula', TAMANHOS.matricula, 'N.º de matrícula'], ['capital_social', TAMANHOS.capital, 'Capital social']],
    { prefixo: 'legal.', chave: 'legal', ecra });
    const forma = textoDe(L.forma_juridica);
    if (forma !== null && !Object.hasOwn(FORMAS_JURIDICAS, forma)) juntar('avisa', 'legal:forma_juridica', ecra, 'Escolha a forma jurídica (empresário em nome individual, ou sociedade): o site trata-a como empresário em nome individual.', { campo: 'legal.forma_juridica' });
    if (forma === 'sociedade') {
      /* O prerender.py faz (L.get(k) or '').strip(): vazio pára (CSC, art.
         171.º); um número rebenta. */
      for (const [k, nome] of Object.entries(CAMPOS_SOCIEDADE)) {
        const v = L[k];
        if (!ausente(v) && v !== '' && typeof v !== 'string') juntar('bloqueia', `legal:${k}:tipo`, ecra, `O ${nome} não está escrito como texto: o site não se consegue gerar. Escreva-o outra vez.`, { campo: `legal.${k}` });
        else if (!stripPy(typeof v === 'string' ? v : '')) juntar('bloqueia', `legal:${k}:vazio`, ecra, `Numa sociedade, a lei obriga a mostrar o ${nome} no site (Código das Sociedades Comerciais, art. 171.º). Escreva-o, ou mude a forma jurídica.`, { campo: `legal.${k}` });
      }
      if (limpo(L.nipc) && !nifValido(limpo(L.nipc))) juntar('avisa', 'legal:nipc:invalido', ecra, 'O NIPC não é válido: o último algarismo não bate certo com os outros. Veja-o na certidão permanente.', { campo: 'legal.nipc' });
      if (textoDe(L.nome_titular) !== null && !limpo(L.nome_titular)) juntar('avisa', 'legal:nome_titular:vazio', ecra, 'Numa sociedade, escreva a firma (o nome completo da sociedade): sem ela o site escreve «[firma por confirmar]».', { campo: 'legal.nome_titular' });
    } else {
      const nif = L.nif;
      if (ausente(nif) || (typeof nif === 'string' && !nif.trim())) juntar('bloqueia', 'legal:nif:vazio', ecra, 'Falta o NIF: a lei obriga a mostrá-lo no site (DL 7/2004, art. 10.º).', { campo: 'legal.nif' });
      else if (!nifValido(nif)) juntar('avisa', 'legal:nif:invalido', ecra, 'Este NIF não é válido: o último algarismo não bate certo com os outros. Veja-o num documento das Finanças.', { campo: 'legal.nif' });
      if (textoDe(L.nome_titular) !== null && !limpo(L.nome_titular)) juntar('avisa', 'legal:nome_titular:vazio', ecra, 'A lei pede o nome do titular no site (DL 7/2004, art. 10.º): escreva-o quando puder. Até lá aparece só a designação comercial.', { campo: 'legal.nome_titular', lembrete: true });
    }
  }
  return out;
}

/* --- Fotografias só para o Google (data/trabalhos.json) ----------------------------
   O prerender.py faz com elas o sitemap das imagens: entra cada fotografia
   que EXISTE (o caminho tal e qual), com a legenda como título. */
export function problemasDosTrabalhos(o, { existe = null } = {}) {
  const f = 'trabalhos';
  const { out, juntar } = caderno(f);
  conferirHead(juntar, f, o.head, { visivel: false });
  if (!ausente(o.items) && !Array.isArray(o.items)) {
    juntar('bloqueia', 'items:forma', ECRAS[f], 'A lista das fotografias para o Google não tem a forma de sempre: o site não se consegue gerar. Só o Renato a pode corrigir.', { campo: 'items' });
    return out;
  }
  const itens = Array.isArray(o.items) ? o.items : [];
  if (itens.length > TAMANHOS.itensTrabalhos) juntar('avisa', 'items:muitas', ECRAS[f], `Há ${itens.length} fotografias: no máximo ${TAMANHOS.itensTrabalhos}.`, { campo: 'items' });
  const vistas = new Set();
  itens.forEach((x, i) => {
    const quem = `item:${identidade(f, 'items', x, i)}`;
    const ecra = ecraDoItem(f, x, i);
    const campo = (k) => `items.${i}.${k}`;
    if (!eObjecto(x)) { juntar('bloqueia', `${quem}:forma`, ecra, 'Uma fotografia para o Google não tem a forma de sempre: o site não se consegue gerar. Só o Renato a pode corrigir.', { campo: `items.${i}` }); return; }
    conferirTextos(juntar, x, [['img', TAMANHOS.caminhoFoto, 'Imagem'], ['cap', TAMANHOS.cap, 'Legenda']], { prefixo: `items.${i}.`, chave: quem, ecra });
    const img = textoDe(x.img);
    if (img !== null && !img.trim()) juntar('avisa', `${quem}:sem_imagem`, ecra, 'Esta linha não tem fotografia: fica de fora do Google. Escolha uma, ou tire a linha.', { campo: campo('img') });
    else if (img && existe && !existe(noRepositorio(img))) juntar('avisa', `${quem}:falta`, ecra, 'Esta fotografia já não existe na biblioteca: fica de fora do Google. Escolha outra, ou tire a linha.', { campo: campo('img') });
    if (img && img.trim()) {
      if (vistas.has(noRepositorio(img))) juntar('avisa', `${quem}:repetida`, ecra, 'Esta fotografia já está na lista.', { campo: campo('img') });
      vistas.add(noRepositorio(img));
    }
    if (textoDe(x.cap) !== null && !limpo(x.cap) && img && img.trim()) juntar('avisa', `${quem}:sem_legenda`, ecra, 'Sem legenda, o Google não sabe o que a fotografia mostra: diga o que se vê (que carro, que serviço).', { campo: campo('cap'), lembrete: true });
  });
  return out;
}

/* --- Os termos, em todos os textos de um ficheiro -------------------------------------- */
export function termosDoFicheiro(f, obj) {
  const { out, juntar } = caderno(f);
  const andar = (v, partes) => {
    if (typeof v === 'string') {
      for (const t of termosEm(v)) {
        const q = deQuem(f, obj, partes);
        juntar('bloqueia', `termos:${q.id}:${t.regra}`, q.ecra, `Este texto não pode ir para o site (${t.nome}: «${t.trecho}»). ${t.remedio}`,
          { campo: q.campo, ...(q.servico !== undefined ? { servico: q.servico } : {}), termo: t.achado });
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => andar(x, [...partes, i]));
    else if (eObjecto(v)) for (const [k, x] of Object.entries(v)) andar(x, [...partes, k]);
  };
  andar(obj, []);
  return out;
}

const PROBLEMAS_DE = { lavagens: problemasDasLavagens, promocoes: problemasDasPromocoes, servicos: problemasDosServicos, site: problemasDoSite, trabalhos: problemasDosTrabalhos };

/**
 * OS PROBLEMAS DOS DADOS (ver o cabeçalho: dados e opcoes).
 * → a lista dos problemas, pela ordem dos ficheiros.
 */
export function problemas(dados, { existe = null, hoje = hojeEmLisboa(), listarPasta = null } = {}) {
  const out = [];
  for (const f of ORDEM) {
    if (!dados || !Object.prototype.hasOwnProperty.call(dados, f)) continue;
    const r = lerFicheiro(f, dados[f]);
    if (r.problema) { out.push(r.problema); continue; }
    out.push(...PROBLEMAS_DE[f](r.obj, { existe, hoje, listarPasta }));
    out.push(...termosDoFicheiro(f, r.obj));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* As fotografias que os dados usam                                    */
/* ------------------------------------------------------------------ */

/**
 * TODOS OS CAMPOS DE FOTOGRAFIA DOS DADOS: [{ f, campo, valor, pasta, ecra, servico? }]
 * `pasta`: 'trabalhos' | 'lavagens' (como o site a resolve), 'cartao' (o
 * og.py) ou 'exacta' (o sitemap das imagens: o caminho tal e qual).
 */
export function fotografiasDosDados(dados) {
  const out = [];
  const ler = (f) => { if (!dados || !Object.prototype.hasOwnProperty.call(dados, f)) return null; const r = lerFicheiro(f, dados[f]); return r.obj ?? null; };
  const juntar = (f, campo, valor, pasta, ecra, extra = {}) => { if (typeof valor === 'string' && valor.trim()) out.push({ f, campo, valor, pasta, ecra, ...extra }); };
  const lav = ler('lavagens');
  (Array.isArray(lav?.itens) ? lav.itens : []).forEach((x, i) => { if (eObjecto(x)) juntar('lavagens', `itens.${i}.foto`, x.foto, 'lavagens', ecraDoItem('lavagens', x, i)); });
  const ser = ler('servicos');
  (Array.isArray(ser?.itens) ? ser.itens : []).forEach((x, i) => {
    if (!eObjecto(x)) return;
    const extra = typeof x.id === 'string' ? { servico: x.id } : {};
    juntar('servicos', `itens.${i}.foto`, x.foto, 'trabalhos', ecraDoItem('servicos', x, i), extra);
    (Array.isArray(x.fotos) ? x.fotos : []).forEach((g, j) => { if (eObjecto(g)) juntar('servicos', `itens.${i}.fotos.${j}.nome`, g.nome, 'trabalhos', ecraDoItem('servicos', x, i), extra); });
  });
  const site = ler('site');
  if (eObjecto(site)) {
    if (eObjecto(site.hero)) juntar('site', 'hero.foto', site.hero.foto, 'trabalhos', ecraDaParte('hero'));
    if (eObjecto(site.faixa)) juntar('site', 'faixa.foto', site.faixa.foto, 'trabalhos', ecraDaParte('faixa'));
    if (eObjecto(site.og)) juntar('site', 'og.foto', site.og.foto, 'cartao', ecraDaParte('og'));
  }
  const trab = ler('trabalhos');
  (Array.isArray(trab?.items) ? trab.items : []).forEach((x, i) => { if (eObjecto(x)) juntar('trabalhos', `items.${i}.img`, x.img, 'exacta', ecraDoItem('trabalhos', x, i)); });
  return out;
}

/**
 * ONDE UM ORIGINAL DA BIBLIOTECA É USADO: os campos dos dados que o servem (pelo
 * caminho, ou pelo nome base — o site procura as variantes pelo nome), as
 * partes fixas do index.html (`fixas`: fotografiasFixas) e o código do site
 * (FOTOGRAFIAS_DO_CODIGO). → [{ ecra, campo?, f?, servico? }] ([] = sem uso)
 */
export function usosDe(original, usados, fixas = new Set()) {
  const c = noRepositorio(original);
  const base = baseDaFoto(c);
  const out = [];
  for (const u of usados) {
    const v = noRepositorio(u.valor);
    if (v === c || (base && baseDaFoto(v) === base)) out.push({ ecra: u.ecra, campo: u.campo, f: u.f, ...(u.servico !== undefined ? { servico: u.servico } : {}) });
  }
  if (base && fixas.has(base)) out.push({ ecra: 'Uma parte fixa da página (o mapa)' });
  if (base && FOTOGRAFIAS_DO_CODIGO.includes(base)) out.push({ ecra: 'O cartão de partilha (quando a fotografia dele falta)' });
  return out;
}

/**
 * O QUE SAI DO REPOSITÓRIO QUANDO SE APAGA UM ORIGINAL: ele, e as variantes dele
 * (<nome base>-<número>.webp na pasta das variantes), a menos que outro
 * original com o mesmo nome base continue lá (as variantes são dos dois).
 *   caminhos  todos os ficheiros das pastas da biblioteca
 * → [caminho]
 */
export function aApagarCom(original, caminhos) {
  const c = noRepositorio(original);
  const b = bibliotecaDe(c);
  if (!b) return [];
  const { pasta, variantes } = BIBLIOTECAS[b];
  const nome = c.slice(pasta.length + 1);
  const base = nome.replace(/\.[a-z0-9]+$/i, '');
  const todos = [...caminhos].map(noRepositorio);
  const outro = todos.some((x) => x !== c && bibliotecaDe(x) === b && x.slice(pasta.length + 1).replace(/\.[a-z0-9]+$/i, '') === base);
  const re = new RegExp(`^${variantes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.webp$`);
  return [c, ...(outro ? [] : todos.filter((x) => re.test(x)))];
}

/* ------------------------------------------------------------------ */
/* O que o painel não muda                                             */
/* ------------------------------------------------------------------ */

/**
 * O QUE UMA GRAVAÇÃO NÃO PODE MUDAR num ficheiro (o painel conserva-o; um
 * pedido que o mudasse é um defeito, ou não veio do painel):
 *   · as chaves que o painel não conhece (no topo do ficheiro e dentro das
 *     secções da página) ficam como estão;
 *   · nos serviços, o identificador, os endereços antigos e o segundo botão
 *     (ligacao, ligacao_texto) de cada serviço que já existia; um serviço novo
 *     não nasce com eles (o identificador, sim: o painel gera-o);
 *   · na página, o destaque do título do topo, e o número internacional — que
 *     só pode mudar para o do telefone escrito.
 * → [{ caminho, motivo }]
 */
export function mudancasBloqueadas(antes, depois, f) {
  const out = [];
  if (!eObjecto(depois) || !CAMPOS[f]) return out;
  const a = eObjecto(antes) ? antes : {};
  const conhecidas = new Set(CAMPOS[f].topo);
  for (const k of new Set([...Object.keys(a), ...Object.keys(depois)])) {
    if (!conhecidas.has(k) && !igual(a[k], depois[k])) out.push({ caminho: k, motivo: 'desconhecido' });
  }
  const dentro = (sec, campos) => {
    const x = eObjecto(a[sec]) ? a[sec] : {}; const y = eObjecto(depois[sec]) ? depois[sec] : {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!campos.includes(k) && !igual(x[k], y[k])) out.push({ caminho: `${sec}.${k}`, motivo: 'desconhecido' });
  };
  if (f !== 'site') dentro('head', CAMPOS.head);
  if (f === 'site') {
    for (const sec of SECCOES_SITE) dentro(sec, CAMPOS.site[sec]);
    const ah = eObjecto(a.hero) ? a.hero : {}; const dh = eObjecto(depois.hero) ? depois.hero : {};
    if (!igual(ah.destaque, dh.destaque)) out.push({ caminho: 'hero.destaque', motivo: 'escondido' });
    const ac = eObjecto(a.contactos) ? a.contactos : {}; const dc = eObjecto(depois.contactos) ? depois.contactos : {};
    if (!igual(ac.telefone_intl, dc.telefone_intl)) {
      const t = lerTelefone(dc.telefone);
      if (!(t && dc.telefone_intl === t.intl)) out.push({ caminho: 'contactos.telefone_intl', motivo: 'escondido' });
    }
  }
  if (f === 'servicos') {
    const lista = (o) => (Array.isArray(o.itens) ? o.itens.filter(eObjecto) : []);
    const antesPorId = new Map(lista(a).filter((x) => typeof x.id === 'string' && x.id).map((x) => [x.id, x]));
    const vistos = new Set();
    for (const x of lista(depois)) {
      const id = typeof x.id === 'string' ? x.id : '';
      const velho = id ? antesPorId.get(id) : null;
      if (velho && !vistos.has(id)) {
        vistos.add(id);
        for (const k of ['alias', 'ligacao', 'ligacao_texto']) if (!igual(velho[k], x[k])) out.push({ caminho: `itens{${id}}.${k}`, motivo: 'so_leitura' });
        continue;
      }
      if (!id || !RE_ID.test(id)) out.push({ caminho: `itens{${id || '?'}}.id`, motivo: 'id' });
      if (Array.isArray(x.alias) ? x.alias.length : !ausente(x.alias)) out.push({ caminho: `itens{${id}}.alias`, motivo: 'so_leitura' });
      for (const k of ['ligacao', 'ligacao_texto']) if (!ausente(x[k])) out.push({ caminho: `itens{${id}}.${k}`, motivo: 'so_leitura' });
    }
  }
  return out;
}
