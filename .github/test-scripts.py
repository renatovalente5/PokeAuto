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


print('\n%s test-scripts: %d certas, %d falhadas' % ('✗' if falhas else '✓', certas, falhas))
sys.exit(1 if falhas or not certas else 0)
