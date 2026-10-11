#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A BATERIA DOS SCRIPTS DA PUBLICAÇÃO (.github/scripts/)
======================================================
Corre em local, NÃO no CI (como a .github/test-guardas.mjs): prova o que os
scripts fazem em casos que os dados de hoje não têm, e um teste falhado não
pode parar uma publicação.

    python3 .github/test-scripts.py

Precisa do Pillow com WebP (o /usr/bin/python3 do Mac tem-no; PYTHON=<outro>
para escolher o que corre os scripts). O repositório não se toca: cada caso
corre numa cópia do script numa pasta temporária, com a forma do site
(data/, assets/img/).

O que prova:
  · webp.py, o limite de 12: com mais de 12 variantes órfãs RECUSA SEM APAGAR
    NENHUMA, e sem escrever nada (nem variantes novas, nem o manifesto) —
    antes apagava-as uma a uma e só depois conferia o limite, e quando recusava
    já não havia nada para salvar; com --forcar apaga; até 12 apaga sem
    pedir; o --verificar nunca apaga.
  · webp.py, as fotografias das lavagens: um original em
    assets/img/lavagens/originais/ ganha as mesmas variantes WebP que os das
    outras fotografias, na pasta-mãe (onde o resolverFoto do app.js as
    procura); sem o original, as variantes dele saem; as ilustrações das
    categorias (cat-*-128.webp) nunca se tocam.
  · prerender.py, os títulos das secções no HTML congelado: a etiqueta e o
    subtítulo apagados saem (o elemento fica vazio e escondido) e voltam
    quando se escrevem; o título apagado passa a ser o nome da secção no
    menu, igual ao do app.js e ao das regras do painel; com os dados de hoje
    o index.html não muda um byte;
  · prerender.py, os textos do topo no HTML congelado ([data-site]: a
    etiqueta, o texto de apresentação, a frase pequena): apagados (ou só com
    espaços, ou sem a chave) saem — vazios e escondidos —, e voltam quando se
    escrevem; com os dados de hoje, só os dois que já estão vazios (o texto de
    apresentação e a frase pequena) ganham o hidden.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(AQUI, 'scripts')
PYTHON = os.environ.get('PYTHON') or sys.executable

certas = 0
falhas = 0


def certo(cond, msg, extra=''):
    global certas, falhas
    if cond:
        certas += 1
    else:
        falhas += 1
        print('  ✗ %s%s' % (msg, ('  — %s' % (extra,)) if extra != '' else ''))


def grupo(titulo):
    print('\n%s' % titulo)


# ------------------------------------------------------------ o site de ensaio
def site_de_ensaio():
    """Uma pasta temporária com a forma do site: o webp.py em
    .github/scripts/ (ele acha a raiz pela pasta onde está), data/ e
    assets/img/trabalhos/originais/."""
    d = tempfile.mkdtemp(prefix='pokeauto-scripts-')
    os.makedirs(os.path.join(d, '.github', 'scripts'))
    shutil.copy(os.path.join(SCRIPTS, 'webp.py'), os.path.join(d, '.github', 'scripts', 'webp.py'))
    os.makedirs(os.path.join(d, 'data'))
    with open(os.path.join(d, 'data', 'site.json'), 'w', encoding='utf-8') as f:
        f.write('{}\n')
    os.makedirs(os.path.join(d, 'assets', 'img', 'trabalhos', 'originais'))
    return d


def caminho(d, rel):
    return os.path.join(d, *rel.split('/'))


def correr_webp(d, *args):
    return subprocess.run([PYTHON, caminho(d, '.github/scripts/webp.py')] + list(args),
                          cwd=d, capture_output=True, text=True)


def orfas(d, n, pasta='trabalhos'):
    """n variantes cujo original desapareceu de <pasta>/originais/, mas que o
    manifesto diz que foram feitas pelo webp.py (só essas é que ele limpa).
    → os caminhos relativos delas."""
    manifesto_c = caminho(d, 'assets/img/.webp.json')
    try:
        with open(manifesto_c, encoding='utf-8') as f:
            manifesto = json.load(f)
    except (IOError, ValueError):
        manifesto = {}
    rels = []
    for k in range(1, n + 1):
        manifesto['assets/img/%s/originais/velha%02d.jpg' % (pasta, k)] = '0' * 40
        rel = 'assets/img/%s/velha%02d-320.webp' % (pasta, k)
        with open(caminho(d, rel), 'wb') as f:
            f.write(b'variante de ensaio')
        rels.append(rel)
    with open(manifesto_c, 'w', encoding='utf-8') as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    return rels


def fotografia(d, rel, largura=900, altura=600):
    """Um JPEG verdadeiro (o webp.py abre-o com o Pillow)."""
    from PIL import Image
    Image.new('RGB', (largura, altura), (200, 40, 30)).save(caminho(d, rel), 'JPEG', quality=90)


def existem(d, rels):
    return [r for r in rels if os.path.exists(caminho(d, r))]


def ler(d, rel):
    with open(caminho(d, rel), 'rb') as f:
        return f.read()


# ------------------------------------------------------------------- o webp.py
grupo('webp.py: o limite de 12 confere-se ANTES de apagar (e de escrever) seja o que for')

d = site_de_ensaio()
try:
    rels = orfas(d, 13)
    manifesto_antes = ler(d, 'assets/img/.webp.json')
    r = correr_webp(d)
    certo(r.returncode == 1 and 'RECUSO' in r.stdout, 'com 13 variantes órfãs, recusa (sai com 1 e diz porquê)', (r.returncode, r.stdout[-300:], r.stderr[-300:]))
    ficaram = existem(d, rels)
    certo(len(ficaram) == 13, 'e não apagou NENHUMA das 13 (antes apagava-as e só depois recusava)', '%d de 13 ainda lá' % len(ficaram))
    certo(ler(d, 'assets/img/.webp.json') == manifesto_antes, 'e o manifesto ficou como estava')
finally:
    shutil.rmtree(d, ignore_errors=True)

d = site_de_ensaio()
try:
    rels = orfas(d, 13)
    fotografia(d, 'assets/img/trabalhos/originais/nova.jpg')
    r = correr_webp(d)
    novas = [f for f in os.listdir(caminho(d, 'assets/img/trabalhos')) if f.startswith('nova-')]
    certo(r.returncode == 1 and len(existem(d, rels)) == 13 and not novas,
          'com uma fotografia nova por preparar e 13 órfãs: recusa sem apagar nada e sem fazer variantes a meio', (r.returncode, novas, len(existem(d, rels))))
finally:
    shutil.rmtree(d, ignore_errors=True)

d = site_de_ensaio()
try:
    rels = orfas(d, 13)
    r = correr_webp(d, '--verificar')
    certo(r.returncode == 1 and len(existem(d, rels)) == 13, 'o --verificar com 13 órfãs: diz que não está em dia, e não apaga nada', (r.returncode, r.stdout[-200:]))
finally:
    shutil.rmtree(d, ignore_errors=True)

d = site_de_ensaio()
try:
    rels = orfas(d, 13)
    r = correr_webp(d, '--forcar')
    certo(r.returncode == 0 and not existem(d, rels), 'com --forcar, apaga as 13', (r.returncode, r.stdout[-200:], r.stderr[-300:]))
finally:
    shutil.rmtree(d, ignore_errors=True)

d = site_de_ensaio()
try:
    rels = orfas(d, 12)
    fotografia(d, 'assets/img/trabalhos/originais/nova.jpg')
    r = correr_webp(d)
    novas = sorted(f for f in os.listdir(caminho(d, 'assets/img/trabalhos')) if f.startswith('nova-'))
    certo(r.returncode == 0 and not existem(d, rels), 'com 12 órfãs (o limite), apaga-as sem pedir', (r.returncode, r.stdout[-200:], r.stderr[-300:]))
    certo(novas == ['nova-320.webp', 'nova-480.webp', 'nova-640.webp', 'nova-900.webp'],
          'e faz as variantes da fotografia nova (as larguras até à do original, e a do original)', novas)
    with open(caminho(d, 'assets/img/.webp.json'), encoding='utf-8') as f:
        m = json.load(f)
    certo('assets/img/trabalhos/originais/nova.jpg' in m, 'e o manifesto passa a conhecer a fotografia nova')
finally:
    shutil.rmtree(d, ignore_errors=True)


grupo('webp.py: as fotografias das lavagens ganham as variantes das outras')

d = site_de_ensaio()
try:
    os.makedirs(caminho(d, 'assets/img/lavagens/originais'))
    ilustracoes = []
    for cat in ('lavagens', 'interior', 'tratamentos'):
        for w in (128, 192):
            rel = 'assets/img/lavagens/cat-%s-%d.webp' % (cat, w)
            with open(caminho(d, rel), 'wb') as f:
                f.write(('ilustração %s %d' % (cat, w)).encode('utf-8'))
            ilustracoes.append(rel)
    antes = dict((r, ler(d, r)) for r in ilustracoes)
    fotografia(d, 'assets/img/lavagens/originais/lavagem-1a2b3c4d.jpg', 640, 480)
    r = correr_webp(d)
    variantes_l = sorted(f for f in os.listdir(caminho(d, 'assets/img/lavagens')) if f.startswith('lavagem-1a2b3c4d-'))
    certo(r.returncode == 0 and variantes_l == ['lavagem-1a2b3c4d-320.webp', 'lavagem-1a2b3c4d-480.webp', 'lavagem-1a2b3c4d-640.webp'],
          'um original de 640 px em lavagens/originais/ ganha as variantes de 320, 480 e 640 na pasta-mãe (antes não ganhava nenhuma: o site servia o original)',
          (r.returncode, variantes_l, r.stdout[-200:], r.stderr[-300:]))
    from PIL import Image
    v320 = caminho(d, 'assets/img/lavagens/lavagem-1a2b3c4d-320.webp')
    if os.path.exists(v320):
        with Image.open(v320) as im:
            certo(im.format == 'WEBP' and im.size == (320, 240), 'e são WebP, à largura certa, com a proporção do original', (im.format, im.size))
    else:
        certo(False, 'e são WebP, à largura certa, com a proporção do original', 'não há variante de 320')
    certo(all(ler(d, x) == antes[x] for x in ilustracoes), 'as ilustrações das categorias ficam como estavam')
    with open(caminho(d, 'assets/img/.webp.json'), encoding='utf-8') as f:
        m = json.load(f)
    certo('assets/img/lavagens/originais/lavagem-1a2b3c4d.jpg' in m, 'e o manifesto conhece o original das lavagens')
    r2 = correr_webp(d, '--verificar')
    certo(r2.returncode == 0, 'a seguir, o --verificar diz que está em dia', r2.stdout[-200:])
    os.remove(caminho(d, 'assets/img/lavagens/originais/lavagem-1a2b3c4d.jpg'))
    r3 = correr_webp(d)
    sobram = sorted(f for f in os.listdir(caminho(d, 'assets/img/lavagens')) if f.startswith('lavagem-1a2b3c4d-'))
    certo(r3.returncode == 0 and not sobram and all(os.path.exists(caminho(d, x)) for x in ilustracoes),
          'apagado o original, as variantes dele saem (como as das outras), e as ilustrações ficam', (r3.returncode, sobram))
finally:
    shutil.rmtree(d, ignore_errors=True)


grupo('prerender.py: um texto apagado dos títulos de uma secção não fica no HTML com o que lá estava')

sys.path.insert(0, SCRIPTS)
import prerender  # noqa: E402  (só a biblioteca-padrão: o Chrome não arranca)

HTML = '''<section class="seccao" id="servicos" aria-labelledby="servicos-t">
  <div class="cabeca">
    <p class="etiqueta">O que fazemos</p>
    <div class="filete"></div>
    <h2 class="h-sec" id="servicos-t">Os nossos serviços</h2>
    <p class="lead">Um subtítulo antigo.</p>
  </div>
</section>
<section class="seccao" id="lavagens" aria-labelledby="lavagens-t">
  <div class="cabeca">
    <p class="etiqueta">Lavagem e estética</p>
    <h2 class="h-sec" id="lavagens-t">Deixe o carro como novo</h2>
    <p class="lead">Preços sem IVA.</p>
  </div>
</section>
<section class="seccao" id="contactos" aria-labelledby="contactos-t">
  <div class="cabeca">
    <p class="etiqueta">Onde estamos</p>
    <h2 class="h-sec" id="contactos-t">Na Rua da Liberdade, 53</h2>
    <p class="lead">Na zona pedonal.</p>
  </div>
</section>'''


def com_dados(servicos, lavagens, contactos):
    d = tempfile.mkdtemp(prefix='pokeauto-heads-')
    os.makedirs(os.path.join(d, 'data'))
    for nome, conteudo in (('servicos.json', {'head': servicos, 'itens': []}),
                           ('lavagens.json', {'head': lavagens, 'itens': []}),
                           ('site.json', {'contactos_head': contactos})):
        with open(os.path.join(d, 'data', nome), 'w', encoding='utf-8') as f:
            json.dump(conteudo, f, ensure_ascii=False)
    return d


def cabeca(html, seccao):
    import re as _re
    i = html.index('id="%s"' % seccao)
    return html[i:html.index('</section>', i)]


CHEIO_C = {'etiqueta': 'Onde estamos', 'titulo': 'Na Rua da Liberdade, 53', 'lead': 'Na zona pedonal.'}
d = com_dados({'etiqueta': '', 'titulo': '', 'lead': ''},
              {'etiqueta': 'Lavagem', 'titulo': 'Preços', 'lead': ''},
              CHEIO_C)
try:
    novo, n = prerender.aplicar_cabecalhos(HTML, d)
    sv = cabeca(novo, 'servicos')
    certo('<p class="etiqueta" hidden></p>' in sv and 'O que fazemos' not in sv,
          'a etiqueta apagada sai: o elemento fica vazio e escondido (antes ficava «O que fazemos»)', sv)
    certo('<p class="lead" hidden></p>' in sv and 'subtítulo antigo' not in sv,
          'o subtítulo apagado sai da mesma maneira', sv)
    certo('<h2 class="h-sec" id="servicos-t">Serviços</h2>' in sv and 'Os nossos serviços' not in sv,
          'o título apagado passa a ser o nome da secção no menu («Serviços»), e não o texto antigo', sv)
    lv = cabeca(novo, 'lavagens')
    certo('<p class="etiqueta">Lavagem</p>' in lv and '<h2 class="h-sec" id="lavagens-t">Preços</h2>' in lv and '<p class="lead" hidden></p>' in lv,
          'nas lavagens: a etiqueta e o título novos, o subtítulo apagado sai', lv)
    certo(cabeca(novo, 'contactos') == cabeca(HTML, 'contactos'), 'os contactos, sem nada apagado, ficam byte a byte como estavam')
    certo(n == 6, 'e conta 6 mudanças (3 nos serviços, 3 nas lavagens)', n)
    outra, n2 = prerender.aplicar_cabecalhos(novo, d)
    certo(outra == novo and n2 == 0, 'outra vez, com os mesmos dados: nada muda (o --verificar não acusa nada)', n2)
finally:
    shutil.rmtree(d, ignore_errors=True)

d = com_dados({'etiqueta': 'Voltou', 'titulo': 'Serviços da oficina', 'lead': 'E o subtítulo também.'},
              {'titulo': 'Preços'}, CHEIO_C)
try:
    escondido = HTML.replace('<p class="etiqueta">O que fazemos</p>', '<p class="etiqueta" hidden></p>').replace('<p class="lead">Um subtítulo antigo.</p>', '<p class="lead" hidden></p>')
    novo, n = prerender.aplicar_cabecalhos(escondido, d)
    sv = cabeca(novo, 'servicos')
    certo('<p class="etiqueta">Voltou</p>' in sv and '<p class="lead">E o subtítulo também.</p>' in sv and 'hidden' not in sv,
          'escritos outra vez, a etiqueta e o subtítulo voltam (sem o hidden)', sv)
    lv = cabeca(novo, 'lavagens')
    certo('<p class="etiqueta" hidden></p>' in lv and '<p class="lead" hidden></p>' in lv,
          'um head sem a etiqueta nem o subtítulo (as chaves nem existem): saem, como se estivessem vazios', lv)
finally:
    shutil.rmtree(d, ignore_errors=True)

d = com_dados({'etiqueta': 'O que fazemos', 'titulo': '   ', 'lead': 'x'}, {'titulo': 'Preços'}, CHEIO_C)
try:
    novo, _ = prerender.aplicar_cabecalhos(HTML, d)
    certo('<h2 class="h-sec" id="servicos-t">Serviços</h2>' in cabeca(novo, 'servicos'), 'um título só com espaços conta como vazio')
finally:
    shutil.rmtree(d, ignore_errors=True)

TITULOS = getattr(prerender, 'TITULO_POR_OMISSAO', None)
certo(TITULOS == {'servicos': 'Serviços', 'lavagens': 'Lavagens', 'contactos': 'Contactos'},
      'os títulos por omissão são os nomes do menu: Serviços, Lavagens, Contactos', TITULOS)

RAIZ_SITE = os.path.dirname(AQUI)
with open(os.path.join(RAIZ_SITE, 'index.html'), encoding='utf-8') as f:
    pagina = f.read()
mesma, n = prerender.aplicar_cabecalhos(pagina, RAIZ_SITE)
certo(mesma == pagina and n == 0, 'com os dados de hoje, o index.html do site não muda um byte', n)


grupo('prerender.py: os textos do topo apagados saem do HTML congelado (e voltam quando se escrevem)')

TOPO = '''<div class="hero__copy">
  <p class="etiqueta" data-site="hero.etiqueta">Oficina multimarca · São João da Madeira</p>
  <h1 class="h-hero" id="hero-titulo">O seu carro merece o melhor cuidado</h1>
  <p class="lead hero__lead" data-site="hero.lead">Um texto de apresentação antigo.</p>
  <a class="btn" href="tel:+351922022364" data-tel><span data-site="hero.cta_principal">Ligar agora</span></a>
  <p class="hero__nota" data-site="hero.nota">Uma frase pequena antiga.</p>
</div>'''
vazio, contas = prerender.aplicar_site(TOPO, {'hero': {'etiqueta': '', 'lead': '', 'nota': '   ', 'cta_principal': 'Ligar agora'}, 'contactos': {}})
certo('<p class="etiqueta" data-site="hero.etiqueta" hidden></p>' in vazio and 'Oficina multimarca' not in vazio,
      'a etiqueta apagada sai: vazia e escondida (antes ficava «Oficina multimarca…» no HTML congelado)', vazio)
certo('<p class="lead hero__lead" data-site="hero.lead" hidden></p>' in vazio and 'apresentação antigo' not in vazio,
      'o texto de apresentação apagado sai da mesma maneira', vazio)
certo('<p class="hero__nota" data-site="hero.nota" hidden></p>' in vazio and 'frase pequena antiga' not in vazio,
      'a frase pequena só com espaços conta como vazia, e sai', vazio)
certo('<span data-site="hero.cta_principal">Ligar agora</span>' in vazio and contas.get('data-site') == 3,
      'o que tem texto fica como estava, e contam-se 3 mudanças', contas)
de_volta, c2 = prerender.aplicar_site(vazio, {'hero': {'etiqueta': 'Oficina', 'lead': 'Voltou.', 'nota': 'Frase.', 'cta_principal': 'Ligar agora'}, 'contactos': {}})
certo('<p class="etiqueta" data-site="hero.etiqueta">Oficina</p>' in de_volta and '<p class="lead hero__lead" data-site="hero.lead">Voltou.</p>' in de_volta
      and '<p class="hero__nota" data-site="hero.nota">Frase.</p>' in de_volta and 'hidden' not in de_volta,
      'escritos outra vez, voltam (e o hidden sai)', de_volta)
outra, c3 = prerender.aplicar_site(de_volta, {'hero': {'etiqueta': 'Oficina', 'lead': 'Voltou.', 'nota': 'Frase.', 'cta_principal': 'Ligar agora'}, 'contactos': {}})
certo(outra == de_volta and not c3.get('data-site'), 'outra vez com os mesmos dados: nada muda', c3)
sem_chave, _ = prerender.aplicar_site(TOPO, {'hero': {'etiqueta': 'Oficina multimarca · São João da Madeira', 'cta_principal': 'Ligar agora'}, 'contactos': {}})
certo('<p class="lead hero__lead" data-site="hero.lead" hidden></p>' in sem_chave and '<p class="hero__nota" data-site="hero.nota" hidden></p>' in sem_chave,
      'sem a chave no ficheiro (o app.js lê undefined): sai, como vazia', sem_chave)

with open(os.path.join(RAIZ_SITE, 'data', 'site.json'), encoding='utf-8') as f:
    site_hoje = json.load(f)
hoje, c_hoje = prerender.aplicar_site(pagina, site_hoje)
mudou = [(a, b) for a, b in zip(pagina.split('\n'), hoje.split('\n')) if a != b]
certo(len(pagina.split('\n')) == len(hoje.split('\n')) and [b.strip() for _, b in mudou] == ['<p class="lead hero__lead" data-site="hero.lead" hidden></p>', '<p class="hero__nota" data-site="hero.nota" hidden></p>'],
      'com os dados de hoje, só os dois que já estão vazios (o texto de apresentação e a frase pequena) ganham o hidden', mudou)


print('\n%s test-scripts: %d certas, %d falhadas' % ('✗' if falhas else '✓', certas, falhas))
sys.exit(1 if falhas or not certas else 0)
