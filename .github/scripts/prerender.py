# -*- coding: utf-8 -*-
"""
Pré-render do conteúdo para os motores de busca
===============================================
O site desenha as secções em JavaScript a partir de data/*.json. Um rastreador
que não corra JS via só 701 das 2.624 palavras — no lugar dos serviços, dos
trabalhos e dos catálogos encontrava "A carregar…". O Google até executa JS,
mas numa segunda passagem que pode demorar dias; o Bing e os leitores de links
muitas vezes nem isso.

Este script corre o PRÓPRIO app.js num Chrome headless e grava o resultado
dentro do index.html, entre marcadores <!--pre:id-->…<!--/pre:id-->. Em runtime
o app.js volta a desenhar por cima, portanto o visitante não nota diferença
nenhuma — não há alteração de UI nem de design.

Corre localmente e na GitHub Action (.github/workflows/prerender.yml), que o
dispara sempre que o cliente edita data/*.json no backoffice.

Uso:  python3 .github/scripts/prerender.py [--verificar]
      --verificar  não escreve; devolve 1 se o HTML estiver desatualizado
"""
import http.server
import os
import re
import socket
import socketserver
import sys
import threading
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, AQUI)
from cdp import Chrome                                        # noqa: E402

PAGINA = os.path.join(RAIZ, 'index.html')

# Zonas que o app.js preenche e que valem indexação
ZONAS = [
    # preenchido à medida que as secções desenhadas em JS existirem
    # (Fase 6: serviços e FAQ; Fase 7: balcão de peças)
]


def porta_livre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir(porta):
    handler = lambda *a, **k: Silencioso(*a, directory=RAIZ, **k)   # noqa: E731
    srv = socketserver.TCPServer(('127.0.0.1', porta), handler)
    srv.allow_reuse_address = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# Corre depois de o app.js desenhar: abre tudo o que está colapsado e limpa o
# que é estado de runtime, para o rastreador ver a lista completa.
PREPARAR = r"""
(async () => {
  const dorme = ms => new Promise(r => setTimeout(r, ms));
  const alvos = %s;

  // esperar que as grelhas deixem de dizer "A carregar…"
  for (let i = 0; i < 80; i++) {
    const porFazer = alvos.filter(id => {
      const el = document.getElementById(id);
      return !el || /A carregar/.test(el.textContent);
    });
    if (!porFazer.length) break;
    await dorme(150);
  }
  await dorme(400);

  // abrir todos os "Ver mais": o conteúdo escondido também tem de ser indexado
  for (let volta = 0; volta < 4; volta++) {
    const botoes = [...document.querySelectorAll('.more-btn')]
      .filter(b => !b.hidden && b.textContent.trim() === 'Ver mais');
    if (!botoes.length) break;
    botoes.forEach(b => b.click());
    await dorme(250);
  }

  // A galeria é distribuída pelo masonry conforme as proporções das imagens JÁ
  // carregadas nesse instante — uma corrida que dava colunas diferentes a cada
  // execução. Aqui redistribuímos por índice, de forma determinística. O
  // app.js volta a fazer o masonry a sério em runtime.
  const galeria = document.getElementById('gallery-grid');
  if (galeria) {
    const colunas = [...galeria.querySelectorAll('.gallery__col')];
    const figuras = [...galeria.querySelectorAll('.gitem')]
      .sort((a, b) => (+a.dataset.i) - (+b.dataset.i));
    if (colunas.length && figuras.length) {
      colunas.forEach(c => { c.innerHTML = ''; });
      figuras.forEach((f, i) => colunas[i %% colunas.length].appendChild(f));
    }
  }

  // limpar estado de runtime que não faz sentido no HTML servido
  document.querySelectorAll('[style*="display"]').forEach(el => {
    if (el.style.display === 'none') el.style.removeProperty('display');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });
  document.querySelectorAll('.is-in').forEach(el => el.classList.remove('is-in'));

  const saida = {};
  alvos.forEach(id => { const el = document.getElementById(id); if (el) saida[id] = el.innerHTML; });
  return JSON.stringify(saida);
})()
""" % ZONAS


def normalizar(html):
    """Whitespace estável, para o --verificar não dar falsos positivos."""
    return re.sub(r'\s+', ' ', html).strip()


def aplicar_site(html, site):
    """Escreve no HTML os contactos que o app.js só corrige em runtime.

    O telefone e a morada visíveis estavam escritos à mão no index.html; o
    app.js reescreve-os a partir do data/site.json quando a página abre. Quem
    não corre JavaScript — e é para esses que este ficheiro existe — via os
    valores antigos. Se o cliente mudasse o telefone no backoffice, o NAP que o
    Google lê deixava de bater com o do perfil de empresa.

    Espelha exactamente o que o app.js faz (app.js:238-260) e devolve também a
    conta das substituições, para o chamador poder desconfiar do silêncio.
    """
    contas = {}
    c = site.get('contacts', {})

    def valor(caminho):
        alvo = site
        for parte in caminho.split('.'):
            if not isinstance(alvo, dict):
                return None
            alvo = alvo.get(parte)
        return alvo

    # [data-site] -> textContent. Nota: se o HTML tiver markup lá dentro e o
    # texto já bater com o JSON, deixa-se estar — achatá-lo só tiraria ênfase
    # ao rastreador sem mudar nada para quem vê a página.
    def troca_texto(m):
        abre, tag, corpo = m.group(0), m.group(1), m.group(3)
        v = valor(m.group(2))
        if v is None or v == '':
            return abre
        limpo = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', corpo)).strip()
        if limpo == re.sub(r'\s+', ' ', str(v)).strip():
            return abre
        contas['data-site'] = contas.get('data-site', 0) + 1
        cabeca = m.group(0)[:m.start(3) - m.start(0)]
        return cabeca + escapar(str(v)) + '</%s>' % tag

    html = re.sub(r'<(\w+)[^>]*\bdata-site="([^"]+)"[^>]*>(.*?)</\1>',
                  troca_texto, html, flags=re.S)

    def trocar_href(texto, marcador, href):
        """Põe `href` em todas as âncoras que tenham o atributo `marcador`.
        Tem de ser independente da ordem dos atributos — no index.html o href
        vem ANTES do data-tel, e uma regex que exigisse a ordem contrária
        passava sem substituir nada e sem se queixar."""
        contador = [0]

        def uma(m):
            tag = m.group(0)
            if not re.search(r'\b%s(?=[\s=>])' % re.escape(marcador), tag):
                return tag
            contador[0] += 1
            return re.sub(r'href="[^"]*"', 'href="%s"' % href, tag, count=1)

        return re.sub(r'<a\b[^>]*>', uma, texto), contador[0]

    if c.get('phone_intl'):
        html, contas['data-tel'] = trocar_href(html, 'data-tel', 'tel:+' + c['phone_intl'])
        html, n = re.subn(r'wa\.me/\d+', 'wa.me/' + c['phone_intl'], html)
        contas['wa.me'] = n
    if c.get('email'):
        html, contas['data-mail'] = trocar_href(html, 'data-mail', 'mailto:' + c['email'])
    if c.get('instagram_url'):
        html, contas['data-ig'] = trocar_href(html, 'data-ig', c['instagram_url'])

    # a legenda da fachada do mapa (app.js:258)
    a1, a2 = c.get('address_line1') or '', c.get('address_line2') or ''
    if a1:
        morada = a1 + (', ' + a2 if a2 else '')
        html, n = re.subn(r'(<[^>]*class="[^"]*map-facade__s[^"]*"[^>]*>).*?(</\w+>)',
                          lambda m: m.group(1) + escapar(morada) + m.group(2),
                          html, flags=re.S)
        contas['mapa'] = n

    return html, contas


def escapar(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


# Etiqueta/título/subtítulo de cada secção: que ficheiro os manda. O app.js faz
# isto em runtime (applyHead, app.js:28); aqui grava-se no ficheiro para o
# rastreador não ficar com a versão antiga quando o cliente editar.
CABECALHOS = [
    # (id da secção, ficheiro em data/, chave) — preenchido na Fase 6
]
CLASSES = [('eyebrow', 'eyebrow'), ('section-title', 'title'), ('section-lead', 'lead')]


def aplicar_cabecalhos(html, raiz):
    """Escreve os cabeçalhos de secção a partir dos data/*.json."""
    import json as _js
    cache, trocas = {}, 0

    for id_seccao, ficheiro, chave in CABECALHOS:
        if ficheiro not in cache:
            cache[ficheiro] = ler_json(os.path.join(raiz, 'data', ficheiro),
                                       'data/' + ficheiro)
        head = (cache[ficheiro] or {}).get(chave) or {}
        m = re.search(r'\bid="%s"' % re.escape(id_seccao), html)
        if not m:
            print('AVISO: secção %s não existe no HTML' % id_seccao)
            continue
        # janela: da abertura da secção até à secção seguinte, para não
        # apanhar por acidente o cabeçalho da secção de baixo
        seguinte = re.search(r'<section\b', html[m.end():])
        fim = m.end() + (seguinte.start() if seguinte else 4000)

        for classe, campo in CLASSES:
            valor = head.get(campo)
            if not valor:
                continue
            padrao = re.compile(
                r'(<(\w+)[^>]*class="[^"]*\b%s\b[^"]*"[^>]*>)(.*?)(</\2>)' % classe, re.S)
            m2 = padrao.search(html, m.end(), fim)
            if not m2:
                continue
            atual = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m2.group(3))).strip()
            if atual == re.sub(r'\s+', ' ', str(valor)).strip():
                continue
            html = html[:m2.start()] + m2.group(1) + escapar(str(valor)) + m2.group(4) + html[m2.end():]
            trocas += 1

    return html, trocas


# ---------------------------------------------------------------- dados estruturados
# Enquanto não houver domínio próprio, o site vive no subcaminho do GitHub Pages.
SITE = 'https://renatovalente5.github.io/PokeAuto'

# Constantes que não vivem no backoffice (são técnicas, o cliente não lhes mexe).
# geo: coordenadas EXACTAS do pin do perfil de empresa do Google, extraídas do
# link Partilhar do Maps (o par !3d!4d do URL longo, que é o pin em si e não o
# centro do mapa). Substituíram uma geocodificação de rua que estava ~120 m ao
# lado. Se o pin for movido no perfil, actualizar aqui.
GEO = {'latitude': 41.3758249, 'longitude': -8.3047875}
# PLACEHOLDER — o cliente ainda não deu o NIF. Sem ele o site não cumpre o
# DL 7/2004 art.10; é bloqueio de publicação, não detalhe.
NIF = None
# Concelhos de onde a loja recebe clientes. Não inflacionar: listar dezenas de
# localidades é doorway content e o Google penaliza.
# Concelhos vizinhos reais de São João da Madeira. Não inflacionar: listar
# dezenas de localidades é doorway content e o Google penaliza.
AREA = ['São João da Madeira', 'Oliveira de Azeméis', 'Santa Maria da Feira']


def travar(erro):
    """Mensagem de paragem legível. Quem lê o log da Action é o cliente que
    editou o backoffice, não um programador — um traceback de 12 linhas do
    json.decoder não lhe diz o que fazer."""
    print('=' * 70)
    print('A PUBLICAÇÃO FOI TRAVADA — há alguma coisa mal preenchida no backoffice')
    print('=' * 70)
    print(str(erro))
    print()
    print('O site continua a servir a versão anterior, que está correcta.')
    print('Corrige no backoffice e grava outra vez.')
    return 6


def ler_json(caminho, rotulo):
    """json.load com erro explicado. Uma gravação truncada no backoffice — o
    cenário exacto para que a mensagem de paragem existe — dava traceback cru."""
    import json as _js
    try:
        with open(caminho, encoding='utf-8') as f:
            return _js.load(f)
    except ValueError as e:
        raise ValueError('O ficheiro %s não é JSON válido (%s). Se a gravação no '
                         'backoffice foi interrompida, volta a gravar essa secção.'
                         % (rotulo, e))
    except OSError as e:
        raise ValueError('Não consegui ler %s (%s).' % (rotulo, e))


def data_do_commit(caminhos):
    """Data ISO do último commit que tocou algum destes ficheiros.

    De propósito NÃO se usa a data de hoje: um <lastmod> que muda sem o conteúdo
    mudar é um lastmod em que o Google deixa de confiar (e ainda gerava um commit
    novo a cada execução do workflow). Sem git disponível, devolve None e o
    <lastmod> é simplesmente omitido — melhor ausente do que inventado."""
    import subprocess
    try:
        r = subprocess.run(['git', 'log', '-1', '--format=%cI', '--'] + list(caminhos),
                           cwd=RAIZ, capture_output=True, text=True, timeout=20)
        return (r.stdout or '').strip() or None
    except Exception:
        return None


# Fontes do <lastmod> de cada página. De propósito SEM o index.html e SEM as
# páginas legais: esses ficheiros são reescritos por este script e commitados pela
# Action, logo a data deles é a do commit do bot. Usá-la fazia o lastmod mudar
# sozinho a cada execução → sitemap reescrito → mais um commit → e, se a execução
# fosse a ronda diária, uma issue a dizer que havia deriva quando não havia.
# O lastmod tem de seguir o CONTEÚDO (data/) e o código que o desenha, nada mais.
FONTES_CONTEUDO = ['data', 'assets/js', 'assets/css']
PAGINAS_SITEMAP = [
    ('/', FONTES_CONTEUDO),
    ('/legal/privacidade.html', ['legal/privacidade.html', 'data/site.json']),
    ('/legal/termos.html', ['legal/termos.html', 'data/site.json']),
    ('/legal/cookies.html', ['legal/cookies.html', 'data/site.json']),
]


def escrever_sitemaps(raiz):
    """sitemap.xml com lastmod real + sitemap-imagens.xml com as fotos próprias.

    O <priority> saiu: o Google ignora-o desde sempre, e mantê-lo dava a ideia
    errada de que estava a fazer alguma coisa."""
    import json as _js

    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for caminho, fontes in PAGINAS_SITEMAP:
        d = data_do_commit(fontes)
        linhas.append('  <url><loc>%s%s</loc>%s</url>'
                      % (SITE, caminho, '<lastmod>%s</lastmod>' % d if d else ''))
    linhas.append('</urlset>')
    sitemap = '\n'.join(linhas) + '\n'

    # Sitemap de imagens: só as fotografias próprias dos trabalhos. As dos
    # catálogos são do fornecedor e aparecem em centenas de sites — submetê-las
    # não traria tráfego e diluía o sinal.
    galeria = ler_json(os.path.join(raiz, 'data', 'trabalhos.json'), 'data/trabalhos.json')
    itens = [i for i in galeria.get('items', []) if i.get('img')]
    img_linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
                  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
                  '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
                  '  <url>', '    <loc>%s/</loc>' % SITE]
    for it in itens:
        # O caminho também tem de ser escapado, não só a legenda: o cliente pode
        # carregar uma foto chamada "T&T logo.jpg" — nome de ficheiro legal — e um
        # & cru torna o XML inválido. O Google rejeita o ficheiro INTEIRO, logo
        # perdiam-se as 24 fotos por causa de uma.
        img_linhas.append('    <image:image><image:loc>%s/%s</image:loc>'
                          '<image:title>%s</image:title></image:image>'
                          % (SITE, escapar_url(str(it['img']).lstrip('/')),
                             escapar_xml(it.get('cap') or '')))
    img_linhas += ['  </url>', '</urlset>']
    sitemap_img = '\n'.join(img_linhas) + '\n'

    # Rede de segurança, a mesma ideia do json.loads do JSON-LD: um sitemap
    # inválido é pior do que nenhum, e antes disto o script escrevia-o, imprimia
    # "sitemaps: ok" e saía com 0.
    import xml.etree.ElementTree as _et
    for nome, conteudo in [('sitemap.xml', sitemap), ('sitemap-imagens.xml', sitemap_img)]:
        try:
            _et.fromstring(conteudo)
        except _et.ParseError as e:
            raise ValueError('%s ficou XML inválido (%s). Costuma ser um & ou < '
                             'no nome de um ficheiro ou numa legenda.' % (nome, e))

    escritos = []
    for nome, conteudo in [('sitemap.xml', sitemap),
                           ('sitemap-imagens.xml', sitemap_img)]:
        alvo = os.path.join(raiz, nome)
        antigo = open(alvo, encoding='utf-8').read() if os.path.exists(alvo) else ''
        if antigo != conteudo:
            open(alvo, 'w', encoding='utf-8').write(conteudo)
            escritos.append(nome)
    return escritos, len(itens)


def escapar_xml(t):
    return (str(t).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def escapar_url(caminho):
    """Escapa um caminho para dentro de <loc>. Os caracteres que não são válidos
    num URL passam a percent-encoding; o & e o < passam a entidade XML."""
    import urllib.parse
    return escapar_xml(urllib.parse.quote(caminho, safe='/-_.~'))


# TODO Fase 10: o grafo ainda tem a forma herdada do projecto anterior
# (LocalBusiness+Store, hasOfferCatalog a partir de services.json). Para uma
# oficina que também vende peças o tipo correcto é AutoRepair, e a venda de
# peças declara-se à parte — refazer quando o modelo de dados existir.
def construir_jsonld(raiz):
    """Gera o JSON-LD a partir de data/*.json, para nunca ficar dessincronizado
    do que o cliente edita no backoffice (telefone, morada, serviços, FAQ)."""
    import json as _json

    def carregar(nome):
        return ler_json(os.path.join(raiz, 'data', nome), 'data/' + nome)

    site = carregar('site.json')
    servicos = carregar('services.json')
    faq = carregar('faq.json')
    c = site.get('contacts', {})

    # A linha 2 da morada é um campo de texto do backoffice. Partia-a por espaços
    # para tirar o código postal, o que dava uma morada errada em silêncio se o
    # cliente escrevesse outro formato. Agora exige-se o formato português e, se
    # não bater, rebenta — uma morada errada nos dados estruturados é pior do que
    # uma publicação que falha e avisa.
    linha2 = (c.get('address_line2') or '').strip()
    m_cp = re.match(r'^(\d{4}-\d{3})\s+(\S.*)$', linha2)
    if not m_cp:
        raise ValueError(
            'contacts.address_line2 = %r não está no formato "3700-169 São João da Madeira". '
            'Corrigir no backoffice (Contactos → Morada linha 2).' % linha2)
    codigo_postal, localidade = m_cp.group(1), m_cp.group(2).strip()

    # Horário: só entra no grafo se o cliente o tiver preenchido. Sem horário é
    # melhor do que com horário errado — o Google mostra-o a quem pesquisa.
    horario = []
    for i, bloco in enumerate(site.get('hours') or []):
        if not isinstance(bloco, dict):
            raise ValueError('hours[%d] devia ser uma linha com dias, hora de abrir e '
                             'hora de fechar, e está %r. Corrigir no backoffice '
                             '(Horário de funcionamento).' % (i, bloco))
        dias = bloco.get('days') or []
        if isinstance(dias, str):
            dias = [dias]
        abre, fecha = (bloco.get('opens') or '').strip(), (bloco.get('closes') or '').strip()
        if not dias or not abre or not fecha:
            continue
        for h, nome in ((abre, 'abre'), (fecha, 'fecha')):
            if not re.match(r'^([01]\d|2[0-3]):[0-5]\d$', h):
                raise ValueError('hours[%d].%s = %r não está no formato HH:MM (24h).' % (i, nome, h))
        horario.append({
            '@type': 'OpeningHoursSpecification',
            'dayOfWeek': ['https://schema.org/' + d for d in dias],
            'opens': abre, 'closes': fecha,
        })

    negocio = {
        '@type': ['LocalBusiness', 'Store'],
        '@id': SITE + '/#loja',
        'name': 'PokeAuto',
        # O nome oficial é o do perfil de empresa do Google, sem espaços. As
        # variantes com espaço ficam aqui: são termos por que o cliente quer ser
        # encontrado, e sem elas o site deixava de declarar que é a mesma entidade.
        'alternateName': ['Poke Auto', 'PokeAuto Oficina'],
        'description': ('Oficina automóvel em São João da Madeira: mecânica, eletricidade, '
                        'eletrónica, revisão completa, lavagens e higienização do ar '
                        'condicionado.'),
        'url': SITE + '/',
        'logo': SITE + '/assets/img/logo.webp',
        'image': SITE + '/assets/img/og.jpg',
        'telephone': '+' + c.get('phone_intl', ''),
        'email': c.get('email', ''),
        'priceRange': '€€',
        'address': {
            '@type': 'PostalAddress',
            'streetAddress': c.get('address_line1', ''),
            'postalCode': codigo_postal,
            'addressLocality': localidade,
            'addressRegion': 'Braga',
            'addressCountry': 'PT',
        },
        'geo': dict({'@type': 'GeoCoordinates'}, **GEO),
        'areaServed': [{'@type': 'City', 'name': n} for n in AREA],
        'sameAs': [u for u in [c.get('instagram_url'), c.get('maps_url'),
                               c.get('facebook_url')] if u],
        'hasOfferCatalog': {
            '@type': 'OfferCatalog',
            'name': 'Serviços de personalização e estampagem',
            'itemListElement': [
                {'@type': 'Offer',
                 'itemOffered': {'@type': 'Service', 'name': s['title'],
                                 'description': s.get('desc', '')}}
                for s in servicos.get('services', [])
            ],
        },
    }
    if NIF:
        negocio['vatID'] = NIF
    if horario:
        negocio['openingHoursSpecification'] = horario
    if c.get('maps_url'):
        negocio['hasMap'] = c['maps_url']

    website = {
        '@type': 'WebSite',
        '@id': SITE + '/#site',
        'url': SITE + '/',
        'name': 'PokeAuto',
        'inLanguage': 'pt-PT',
        'publisher': {'@id': SITE + '/#loja'},
        # sem SearchAction de propósito: o site não tem pesquisa, seria falso
    }

    # A página é ao mesmo tempo WebPage e FAQPage, e leva o @id da própria URL.
    # Antes era um nó '#faq' solto, que nada no grafo referenciava — um nó órfão
    # é uma afirmação sobre nada. Assim fica ligado ao WebSite e à loja.
    # (Nota: desde 7-mai-2026 o FAQPage já não produz sanfona nos resultados do
    # Google. Mantém-se porque descreve conteúdo que existe de facto na página e
    # é lido por outros consumidores do grafo, não à espera de rich result.)
    pagina = {
        '@type': ['WebPage', 'FAQPage'],
        '@id': SITE + '/',
        'url': SITE + '/',
        'name': 'PokeAuto — Oficina auto em São João da Madeira',
        'inLanguage': 'pt-PT',
        'isPartOf': {'@id': SITE + '/#site'},
        'about': {'@id': SITE + '/#loja'},
        'mainEntity': [
            {'@type': 'Question', 'name': q['q'],
             'acceptedAnswer': {'@type': 'Answer', 'text': q['a']}}
            for q in faq.get('items', [])
        ],
    }
    if not pagina['mainEntity']:
        pagina['@type'] = 'WebPage'
        del pagina['mainEntity']

    grafo = {'@context': 'https://schema.org',
             '@graph': [negocio, website, pagina]}
    # O <script> vem de dentro daqui de propósito: os marcadores <!--pre:...-->
    # TÊM de ficar FORA dele. JSON não admite comentários, e um marcador dentro
    # do bloco fazia o JSON.parse do Google falhar e ignorar o grafo inteiro.
    return ('<script type="application/ld+json">\n'
            + _json.dumps(grafo, ensure_ascii=False, indent=2)
            + '\n  </script>')


def main():
    verificar = '--verificar' in sys.argv

    # O site é construído por fases. Enquanto não houver conteúdo em data/ nem
    # zonas declaradas, não há nada a congelar — e é melhor dizê-lo do que
    # rebentar a meio ou, pior, escrever um index.html a fingir.
    if not os.path.exists(os.path.join(RAIZ, 'data', 'site.json')):
        print('Ainda não existe data/site.json — nada para pré-renderizar.')
        return 0
    if not ZONAS:
        print('ZONAS está vazio — nenhuma secção desenhada em JS foi declarada ainda.')
        return 0

    original = open(PAGINA, encoding='utf-8').read()

    em_falta = [z for z in ZONAS if '<!--pre:%s-->' % z not in original]
    if em_falta:
        print('ERRO: faltam marcadores no index.html: %s' % ', '.join(em_falta))
        return 2

    porta = porta_livre()
    srv = servir(porta)
    chrome = None
    try:
        chrome = Chrome(porta=porta_livre())
        # Janela fixa: a cor dos autocolantes, o nº de colunas da galeria e o
        # corte do "Ver mais" dependem todos da largura. Sem isto, a saída
        # mudava entre a minha máquina e a do GitHub, gerando commits de ruído
        # a cada execução.
        chrome.cmd('Emulation.setDeviceMetricsOverride', width=1280, height=900,
                   deviceScaleFactor=1, mobile=False)
        chrome.abrir('http://127.0.0.1:%d/' % porta, espera=2.5)
        import json as _json
        bruto = chrome.js(PREPARAR)
        if not bruto:
            print('ERRO: o Chrome não devolveu conteúdo')
            return 3
        zonas = _json.loads(bruto)
    finally:
        if chrome:
            chrome.fechar()
        srv.shutdown()

    novo = original
    resumo = []

    # dados estruturados, gerados a partir do que o cliente edita. Se algum campo
    # do backoffice estiver mal preenchido, dizê-lo em português e em claro — quem
    # vai ler este log é quem editou, não um programador.
    try:
        jsonld = construir_jsonld(RAIZ)
    except ValueError as e:
        return travar(e)
    pad_ld = re.compile(r'(<!--pre:jsonld-->).*?(<!--/pre:jsonld-->)', re.S)
    if pad_ld.search(novo):
        novo = pad_ld.sub(lambda m: m.group(1) + jsonld + m.group(2), novo, count=1)
        resumo.append('json-ld: %d KB' % (len(jsonld) // 1024))
    else:
        print('AVISO: marcador de json-ld em falta')

    for z in ZONAS:
        conteudo = zonas.get(z)
        if conteudo is None:
            print('AVISO: zona %s não veio do browser' % z)
            continue
        padrao = re.compile(r'(<!--pre:%s-->).*?(<!--/pre:%s-->)' % (z, z), re.S)
        if not padrao.search(novo):
            print('AVISO: marcador de %s desapareceu' % z)
            continue
        novo = padrao.sub(lambda m: m.group(1) + conteudo + m.group(2), novo, count=1)
        resumo.append('%s: %d KB' % (z, len(conteudo) // 1024))

    # contactos: o que o app.js corrige em runtime passa a estar no ficheiro
    try:
        novo, contas = aplicar_site(novo, ler_json(
            os.path.join(RAIZ, 'data', 'site.json'), 'data/site.json'))
    except ValueError as e:
        return travar(e)
    esperado = len(re.findall(r'data-site="', novo))
    if not contas.get('wa.me'):
        print('AVISO: não encontrei nenhum link wa.me para actualizar')
    resumo.append('contactos: %s' % (', '.join('%s×%d' % (k, v) for k, v in sorted(contas.items()))
                                     or 'já em dia (%d nós data-site)' % esperado))

    # etiquetas/títulos/subtítulos das 9 secções
    try:
        novo, n_heads = aplicar_cabecalhos(novo, RAIZ)
    except ValueError as e:
        return travar(e)
    resumo.append('cabeçalhos de secção: %s' % ('%d actualizados' % n_heads if n_heads else 'já em dia'))

    # Rede de segurança: o grafo TEM de ser JSON válido. Já aconteceu ficar um
    # marcador HTML dentro do <script>, o que invalidou o JSON e fez o Google
    # ignorar os dados estruturados todos — sem nada disto dar erro.
    import json as _jv
    blocos = re.findall(r'<script type="application/ld\+json">(.*?)</script>', novo, re.S)
    if not blocos:
        print('ERRO: o HTML não tem nenhum bloco application/ld+json')
        return 4
    for b in blocos:
        try:
            _jv.loads(b)
        except ValueError as e:
            print('ERRO: JSON-LD inválido — %s' % e)
            print('      início do bloco: %r' % b[:140])
            return 5

    mudou = normalizar(novo) != normalizar(original)
    if verificar:
        print('HTML pré-renderizado está %s' % ('DESATUALIZADO' if mudou else 'em dia'))
        return 1 if mudou else 0

    if mudou:
        open(PAGINA, 'w', encoding='utf-8').write(novo)

    try:
        sitemaps, n_fotos = escrever_sitemaps(RAIZ)
    except ValueError as e:
        return travar(e)
    print('  sitemaps: %s (%d fotos no de imagens)'
          % (', '.join(sitemaps) if sitemaps else 'já em dia', n_fotos))

    # quanto texto passou a ser visível sem JavaScript
    sem_js = re.sub(r'<script.*?</script>|<style.*?</style>', '', novo, flags=re.S)
    palavras = len(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', sem_js)).split())
    print('  ' + '\n  '.join(resumo))
    print('\n%s — %d palavras visíveis sem JavaScript'
          % ('index.html atualizado' if mudou else 'index.html já estava em dia', palavras))
    return 0


if __name__ == '__main__':
    sys.exit(main())
