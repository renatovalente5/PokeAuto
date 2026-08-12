# -*- coding: utf-8 -*-
"""
Sanidade dos comentários HTML  —  python3 .github/scripts/html_sao.py
=====================================================================
Existe por causa de um defeito que foi para produção: um comentário meu levava
lá dentro a sintaxe dos marcadores de pré-render, e o «fecha comentário» dela
fechou o comentário a meio. Todo o texto seguinte — cinco parágrafos de notas
internas — passou a ser conteúdo visível no topo da página, em produção, num
site de um cliente.

Não há erro nenhum a acusar isto: o HTML é válido, o browser desenha-o, e quem
publicou não vê nada de errado se não voltar a abrir a página. É exactamente a
mesma família de problema que o css_sao.py apanha do lado do CSS.

O que se verifica, sem dependências:
  - nenhum comentário contém `<!--` ou `-->` no corpo
  - nenhum comentário fica aberto até ao fim do ficheiro
  - nenhum `-->` aparece sem um `<!--` a abrir
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IGNORAR = {'node_modules', '.git', '_source'}


def ficheiros():
    for raiz, dirs, nomes in os.walk(RAIZ):
        dirs[:] = [d for d in dirs if d not in IGNORAR and not d.startswith('.')]
        for n in sorted(nomes):
            if n.endswith('.html') and not n.startswith('_'):
                yield os.path.join(raiz, n)


def linha_de(texto, pos):
    return texto.count('\n', 0, pos) + 1


def verificar(caminho):
    rel = os.path.relpath(caminho, RAIZ)
    texto = open(caminho, encoding='utf-8').read()
    queixas = []
    i = 0
    while True:
        a = texto.find('<!--', i)
        if a < 0:
            break
        b = texto.find('-->', a + 4)
        if b < 0:
            queixas.append('%s:%d — comentário aberto e nunca fechado'
                           % (rel, linha_de(texto, a)))
            break
        corpo = texto[a + 4:b]
        # `<!--pre:id-->` são marcadores a sério, não comentários com lixo dentro:
        # aparecem SEMPRE fora de um comentário, por isso se um deles cai dentro
        # de um corpo é porque alguém escreveu a sintaxe num comentário.
        if '<!--' in corpo or '-->' in corpo:
            queixas.append(
                '%s:%d — este comentário leva a sintaxe de comentário no corpo; '
                'o primeiro «fecha comentário» fecha-o aqui e o resto do texto '
                'passa a aparecer NA PÁGINA' % (rel, linha_de(texto, a)))
        i = b + 3
    # um `-->` órfão, fora de qualquer comentário
    fora = 0
    j = 0
    while True:
        a = texto.find('<!--', j)
        b = texto.find('-->', j)
        if b < 0:
            break
        if a < 0 or b < a:
            fora += 1
            queixas.append('%s:%d — `-->` sem `<!--` a abrir'
                           % (rel, linha_de(texto, b)))
            j = b + 3
        else:
            fim = texto.find('-->', a + 4)
            j = (fim + 3) if fim >= 0 else len(texto)
    return queixas


def main():
    todas = []
    n = 0
    for f in ficheiros():
        n += 1
        todas += verificar(f)
    if todas:
        print('HTML com comentários partidos:')
        for q in todas:
            print('  ' + q)
        return 1
    print('  HTML são: %d ficheiros, comentários todos bem fechados' % n)
    return 0


if __name__ == '__main__':
    sys.exit(main())
