# -*- coding: utf-8 -*-
"""
Sanidade do CSS  —  python3 .github/scripts/css_sao.py
======================================================
Existe porque o browser não se queixa: um CSS partido não dá erro nenhum, só
deita fora a regra e segue. Aconteceu duas vezes neste site.

  1. Um bloco de declarações ficou sem selector (o selector foi apagado, as
     declarações não). Andou semanas em produção sem ninguém dar por isso.
  2. Um comentário ficou sem o `/*` de abertura. O parser descartou tudo até
     recuperar e comeu a regra a seguir — o `object-fit: contain` das
     fotografias do detalhe desapareceu e as imagens saíam esticadas.

O que se verifica, sem dependências e sem parser a sério:
  - comentários emparelhados: nenhum `*/` fora de comentário, nenhum `/*` aberto
  - chavetas emparelhadas
  - nada de `;` ao nível de topo (é o sinal de declarações sem selector)
  - todo o texto entre `}` e `{` parece um selector, uma at-rule ou nada
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = os.path.join(RAIZ, 'assets', 'css')


def linha_de(texto, pos):
    return texto.count('\n', 0, pos) + 1


def sem_comentarios(texto, queixas, ficheiro):
    """Devolve o texto com os comentários trocados por espaços, e queixa-se dos
    que não fecham ou que fecham sem abrir."""
    out = []
    i = 0
    n = len(texto)
    while i < n:
        if texto.startswith('/*', i):
            fim = texto.find('*/', i + 2)
            if fim == -1:
                queixas.append('%s:%d — comentário aberto e nunca fechado'
                               % (ficheiro, linha_de(texto, i)))
                out.append(' ' * (n - i))
                break
            # preserva as mudanças de linha para os números baterem certo
            out.append(re.sub(r'[^\n]', ' ', texto[i:fim + 2]))
            i = fim + 2
        elif texto.startswith('*/', i):
            queixas.append('%s:%d — `*/` sem `/*` a abrir (o parser descarta '
                           'a regra seguinte)' % (ficheiro, linha_de(texto, i)))
            out.append('  ')
            i += 2
        else:
            out.append(texto[i])
            i += 1
    return ''.join(out)


SELECTOR_OK = re.compile(r'^[\w\s.#\[\]="\'^$*|~():+>,&/\-]*$')


def verificar(caminho):
    ficheiro = os.path.relpath(caminho, RAIZ)
    texto = open(caminho, encoding='utf-8').read()
    queixas = []
    limpo = sem_comentarios(texto, queixas, ficheiro)

    profundidade = 0
    inicio_topo = 0
    for m in re.finditer(r'[{}]', limpo):
        if m.group() == '{':
            if profundidade == 0:
                bloco = limpo[inicio_topo:m.start()]
                if ';' in bloco:
                    queixas.append('%s:%d — `;` fora de qualquer regra: '
                                   'declarações sem selector'
                                   % (ficheiro, linha_de(limpo, inicio_topo + bloco.index(';'))))
                nu = bloco.strip()
                if nu and not nu.startswith('@') and not SELECTOR_OK.match(nu):
                    queixas.append('%s:%d — isto não parece um selector: %r'
                                   % (ficheiro, linha_de(limpo, m.start()), nu[:60]))
            profundidade += 1
        else:
            profundidade -= 1
            if profundidade < 0:
                queixas.append('%s:%d — `}` a mais'
                               % (ficheiro, linha_de(limpo, m.start())))
                profundidade = 0
            if profundidade == 0:
                inicio_topo = m.end()
    if profundidade:
        queixas.append('%s — ficaram %d chavetas por fechar' % (ficheiro, profundidade))

    resto = limpo[inicio_topo:].strip()
    if ';' in resto:
        queixas.append('%s — `;` depois da última regra: declarações sem selector' % ficheiro)
    return queixas


def main():
    todas = []
    for nome in sorted(os.listdir(CSS)):
        if nome.endswith('.css'):
            todas += verificar(os.path.join(CSS, nome))
    if todas:
        print('CSS com problemas:')
        for q in todas:
            print('  ' + q)
        return 1
    print('  CSS são: comentários e chavetas emparelhados, nada solto no topo')
    return 0


if __name__ == '__main__':
    sys.exit(main())
