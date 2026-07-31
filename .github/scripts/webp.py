# -*- coding: utf-8 -*-
"""
Variantes responsivas das fotografias que o cliente carrega no backoffice
=========================================================================
O cliente carrega fotografias no Pages CMS. O que chega é o que sai do
telemóvel: 3000 a 4000 px de largura e vários MB. Servir isso a quem vê a
imagem num cartão de 260 px é desperdiçar 95% do que se descarregou.

Este script pega em cada original e gera as variantes WebP que o `srcset` do
site usa, COM O MESMO NOME BASE e NA MESMA PASTA:

    assets/img/trabalhos/porsche.jpg
        -> assets/img/trabalhos/porsche-320.webp
        -> assets/img/trabalhos/porsche-480.webp
        -> assets/img/trabalhos/porsche-640.webp
        -> assets/img/trabalhos/porsche-840.webp

É essa a convenção que o resolverFoto() do assets/js/app.js espera. A versão
anterior deste ficheiro tinha vindo de outro projecto e escrevia para uma
subpasta webp/ com outras larguras: uma fotografia carregada pelo cliente
gerava variantes que o site nunca ia procurar, e a foto simplesmente não
aparecia. Não dava erro nenhum — só não aparecia.

Regras:
  - o original NÃO é apagado: é a fonte para regenerar e o que o backoffice mostra
  - ficheiros que já são variantes (terminam em -<número>.webp) são ignorados,
    senão gerava variantes de variantes até ao infinito
  - só se gera uma largura se o original for pelo menos 10% maior; ampliar não
    acrescenta detalhe nenhum, só bytes
  - além das larguras normais gera-se sempre uma ao tamanho do original
    (limitada a MAX_LARGURA): com descritores `w` no srcset o `src` deixa de ser
    candidato, e sem essa variante nenhum ecrã grande chegaria à resolução real
  - idempotente por HASH DE CONTEÚDO, não por data. Num runner do GitHub o
    actions/checkout reescreve tudo por ordem alfabética, portanto o original
    fica sempre com data anterior à variante e uma comparação de datas nunca
    dispara — uma foto substituída com o mesmo nome serviria a variante antiga
    para sempre, e mostrava fotos diferentes conforme o ecrã.

Corre antes do dimensoes.py e do prerender.py, no mesmo workflow.

Uso:  python3 .github/scripts/webp.py [--verificar] [--qualidade 82]
"""
import hashlib
import json
import os
import re
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
IMGS = os.path.join(RAIZ, 'assets', 'img')

# Só as pastas cujas imagens são emitidas com srcset. Logótipos e ícones ficam
# de fora: já são pequenos e alguns precisam de transparência exacta.
PASTAS = ['trabalhos', 'pecas']
ORIGEM_EXT = ('.jpg', '.jpeg', '.png', '.webp')

# As larguras que o site pede. 320-840 cobrem os cartões e o carrossel; 1280 e
# 1800 existem para a fotografia do topo, que é servida a 100vw.
LARGURAS = [320, 480, 640, 840, 1280, 1800]
MAX_LARGURA = 1800
QUALIDADE = 82

# Uma variante é qualquer ficheiro que termine em -<número>.webp
E_VARIANTE = re.compile(r'-\d+\.webp$', re.I)

MANIFESTO = os.path.join(IMGS, '.webp.json')


def qualidade_para(largura):
    """Quanto maior a imagem, mais se pode comprimir sem se dar por isso."""
    if largura <= 640:
        return QUALIDADE
    if largura <= 1280:
        return 76
    return 72


def variantes(caminho, larg_original):
    """Que ficheiros WebP devem existir para este original."""
    base = os.path.splitext(os.path.basename(caminho))[0]
    pasta = os.path.dirname(caminho)
    larguras = [w for w in LARGURAS if larg_original >= w * 1.1]
    tecto = min(larg_original, MAX_LARGURA)
    if tecto not in larguras:
        larguras.append(tecto)
    return [(os.path.join(pasta, '%s-%d.webp' % (base, w)), w)
            for w in sorted(set(larguras))]


def digerir(caminho):
    h = hashlib.sha1()
    with open(caminho, 'rb') as f:
        for bloco in iter(lambda: f.read(65536), b''):
            h.update(bloco)
    return h.hexdigest()


def carregar_manifesto():
    try:
        with open(MANIFESTO, encoding='utf-8') as f:
            return json.load(f)
    except (IOError, ValueError):
        return {}


def originais(pasta):
    """Os ficheiros que são fonte, não variantes geradas."""
    saida = []
    for f in sorted(os.listdir(pasta)):
        caminho = os.path.join(pasta, f)
        if not os.path.isfile(caminho):
            continue
        if not f.lower().endswith(ORIGEM_EXT):
            continue
        if E_VARIANTE.search(f):
            continue
        saida.append(caminho)
    return saida


def main():
    verificar = '--verificar' in sys.argv
    qual_base = QUALIDADE
    if '--qualidade' in sys.argv:
        qual_base = int(sys.argv[sys.argv.index('--qualidade') + 1])

    manifesto = carregar_manifesto()
    novo_manifesto = {}
    por_fazer, feitos, apagados = [], 0, []
    antes = depois = 0

    for nome in PASTAS:
        pasta = os.path.join(IMGS, nome)
        if not os.path.isdir(pasta):
            continue
        esperados = set()
        for origem in originais(pasta):
            rel = os.path.relpath(origem, RAIZ).replace(os.sep, '/')
            sha = digerir(origem)
            novo_manifesto[rel] = sha
            mudou = manifesto.get(rel) != sha
            try:
                im = Image.open(origem)
            except Exception as e:            # ficheiro corrompido a meio do upload
                print('  ! %s ignorado: %s' % (rel, e))
                continue
            with im:
                larg = im.size[0]
                for destino, alvo in variantes(origem, larg):
                    esperados.add(os.path.basename(destino))
                    if os.path.exists(destino) and not mudou:
                        continue
                    por_fazer.append(os.path.relpath(destino, RAIZ))
                    if verificar:
                        continue
                    copia = im.convert('RGB')
                    if copia.size[0] > alvo:
                        h = round(copia.size[1] * alvo / copia.size[0])
                        copia = copia.resize((alvo, h), Image.LANCZOS)
                    q = min(qual_base, qualidade_para(alvo))
                    copia.save(destino, 'WEBP', quality=q, method=6)
                    feitos += 1
                    antes += os.path.getsize(origem)
                    depois += os.path.getsize(destino)

        # Variantes cujo original desapareceu: sem isto o repositório só cresce.
        # Só se apaga o que tem um nome-base COM original conhecido — as
        # fotografias que vieram com o site não têm original no repositório e
        # não podem ser apagadas por engano.
        bases_com_original = set(
            os.path.splitext(os.path.basename(p))[0] for p in originais(pasta))
        for f in sorted(os.listdir(pasta)):
            if not E_VARIANTE.search(f):
                continue
            base = E_VARIANTE.sub('', f)
            if base in bases_com_original and f not in esperados:
                apagados.append(os.path.relpath(os.path.join(pasta, f), RAIZ))
                if not verificar:
                    os.remove(os.path.join(pasta, f))

    if verificar:
        if por_fazer or apagados:
            print('webp: por gerar %d, por apagar %d' % (len(por_fazer), len(apagados)))
            for p in (por_fazer + apagados)[:12]:
                print('   ' + p)
            return 1
        print('webp: em dia.')
        return 0

    manifesto.update(novo_manifesto)
    with open(MANIFESTO, 'w', encoding='utf-8') as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')

    if feitos:
        print('webp: %d variantes geradas (%.1f MB de originais → %.1f MB)'
              % (feitos, antes / 1048576.0, depois / 1048576.0))
    else:
        print('webp: nada a fazer.')
    if apagados:
        print('webp: %d variantes órfãs apagadas' % len(apagados))
    return 0


if __name__ == '__main__':
    sys.exit(main())
