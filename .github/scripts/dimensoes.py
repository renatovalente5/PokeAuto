# -*- coding: utf-8 -*-
"""
Dimensões intrínsecas das imagens → data/_dimensoes.json
========================================================
Porque isto existe: os <img> da galeria eram emitidos sem width nem height. Sem
dimensões o browser não sabe que espaço reservar, e antes de a foto chegar cada
<img> ocupa zero de altura. Consequência medida a 1280x800: as 24 fotografias da
galeria colapsavam todas dentro do primeiro ecrã, o Chrome concluía que estavam
à vista e o loading="lazy" não adiava nada — 4,2 MB pedidos na primeira carga,
em vez de 0. E, quando as fotos chegavam, a galeria era remontada e saltava.

Com as dimensões, o browser reserva o espaço, o lazy volta a funcionar e o
masonry acerta na primeira tentativa.

O ficheiro fica com nome começado por "_" e NÃO está declarado no .pages.yml,
para não aparecer ao cliente no backoffice: é um artefacto de build, não
conteúdo.

Uso:  python3 .github/scripts/dimensoes.py [--verificar]
"""
import json
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
IMGS = os.path.join(RAIZ, 'assets', 'img')
SAIDA = os.path.join(RAIZ, 'data', '_dimensoes.json')
EXT = ('.jpg', '.jpeg', '.png', '.webp', '.avif')


def recolher():
    mapa = {}
    for pasta, _, ficheiros in os.walk(IMGS):
        for f in sorted(ficheiros):
            if not f.lower().endswith(EXT):
                continue
            caminho = os.path.join(pasta, f)
            rel = os.path.relpath(caminho, RAIZ).replace(os.sep, '/')
            try:
                with Image.open(caminho) as im:
                    mapa[rel] = list(im.size)
            except Exception as e:                       # ficheiro corrompido
                print('AVISO: %s ilegível (%s)' % (rel, e))
    return dict(sorted(mapa.items()))


def main():
    mapa = recolher()
    # compacto: é servido a cada visita e ninguém o lê à mão
    novo = json.dumps(mapa, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'
    antigo = ''
    if os.path.exists(SAIDA):
        antigo = open(SAIDA, encoding='utf-8').read()

    if '--verificar' in sys.argv:
        igual = novo == antigo
        print('data/_dimensoes.json está %s (%d imagens)'
              % ('em dia' if igual else 'DESATUALIZADO', len(mapa)))
        return 0 if igual else 1

    if novo != antigo:
        open(SAIDA, 'w', encoding='utf-8').write(novo)
        print('data/_dimensoes.json escrito — %d imagens' % len(mapa))
    else:
        print('data/_dimensoes.json já estava em dia — %d imagens' % len(mapa))
    return 0


if __name__ == '__main__':
    sys.exit(main())
