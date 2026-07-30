# -*- coding: utf-8 -*-
"""
Guarda de termos proibidos — trava a publicação antes de o site ir para o ar
=============================================================================
O cliente edita o site sozinho pelo backoffice. Há coisas que, escritas num
sítio na Internet com o nome e a morada da empresa, ficam a ser prova
documental permanente, indexada e arquivada. Este script corre como PRIMEIRO
passo do workflow: se encontrar alguma delas, a publicação falha e o site
continua a servir a versão anterior.

Porque cada regra existe:

1. ANULAÇÃO DE FAP/EGR — o Regulamento (CE) n.º 715/2007, art. 5.º n.º 2 proíbe
   dispositivos manipuladores dos sistemas de controlo de emissões. O art. 114.º
   n.º 5 do Código da Estrada proíbe a circulação de veículos com componentes
   não aprovados (coima 250–1250 € e apreensão do documento). E ANUNCIAR o
   serviço acresce risco próprio: o Código da Publicidade (DL 330/90) art. 7.º
   proíbe publicidade que encoraje comportamentos prejudiciais ao ambiente.
   Limpeza, regeneração e substituição por peça homologada são legais; anular,
   remover, tapar ou "programar para fora" não são.

2. AIRBAGS E PRÉ-TENSORES — são artigos pirotécnicos de categoria P1 (DL
   135/2015, que transpõe a Diretiva 2013/29/UE) e não podem ser
   disponibilizados ao público em geral. Não entram no catálogo de peças.

3. "SEM GARANTIA" — o DL 84/2021 dá 3 anos em bens novos e um mínimo de 18 meses
   em usados. Escrever que uma peça não tem garantia é cláusula nula e prática
   comercial desleal.

4. ALEGAÇÕES AMBIENTAIS GENÉRICAS — "ecológico", "verde", "amigo do ambiente"
   sem prova ficam proibidas em toda a UE a partir de 27-09-2026 pela Diretiva
   (UE) 2024/825.

5. PLATAFORMA ODR EUROPEIA — desligada e revogada em 20-07-2025 pelo Regulamento
   (UE) 2024/3228. Um link para lá é hoje um defeito, não uma conformidade.

6. UNIVERSO POKÉMON — a marca da oficina já usa um trocadilho visual. Escrever
   o nome da franquia ou referências ao universo em texto, legendas, alt ou
   meta-tags transforma uma paródia gráfica numa associação declarada. O site
   não amplifica o risco de marca do cliente.

Uso:  python3 .github/scripts/termos.py
      devolve 0 se estiver tudo limpo, 1 se encontrar alguma coisa
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))

# (expressão, explicação, o que fazer)
REGRAS = [
    (r'\b(anula\w*|remo[çc]\w*|remover|elimina\w*|desactiv\w*|desativ\w*|by-?pass)\b'
     r'[^.]{0,40}\b(fap|dpf|egr|catalisador|cataliz\w*|adblue|scr)\b',
     'anulação/remoção de sistema de controlo de emissões',
     'Só se pode anunciar limpeza, regeneração ou substituição por peça homologada.'),
    (r'\b(fap|dpf|egr|adblue)\b[^.]{0,40}\b(anula\w*|remo\w*|elimina\w*|off|delete)\b',
     'anulação/remoção de sistema de controlo de emissões',
     'Só se pode anunciar limpeza, regeneração ou substituição por peça homologada.'),
    (r'\bairbag', 'airbag',
     'Airbags e pré-tensores são pirotecnia P1 (DL 135/2015): não podem ser '
     'disponibilizados ao público. Retirar do catálogo de peças.'),
    (r'pr[ée]-?tensor', 'pré-tensor de cinto',
     'Mesma regra dos airbags: pirotecnia P1, não pode ser vendido ao público.'),
    (r'sem\s+garantia', '"sem garantia"',
     'O DL 84/2021 dá 3 anos em peças novas e 18 meses no mínimo em usadas. '
     'A frase é nula e é prática comercial desleal.'),
    (r'\b(ecol[óo]gic\w*|amig\w*\s+do\s+ambiente|verde\b|sustent[áa]vel|'
     r'carbono\s+neutro|neutro\s+em\s+carbono|eco-?friendly)\b',
     'alegação ambiental genérica',
     'A Diretiva (UE) 2024/825 proíbe estas alegações sem prova a partir de '
     '27-09-2026. Dizer o que se faz em concreto, não adjectivar.'),
    (r'ec\.europa\.eu/(consumers/)?odr|plataforma\s+de\s+resolu[çc][ãa]o\s+de\s+lit[íi]gios\s+em\s+linha',
     'plataforma ODR europeia',
     'Foi desligada e revogada em 20-07-2025 pelo Reg. (UE) 2024/3228. '
     'A entidade correcta para São João da Madeira é o CICAP.'),
    (r'\bpok[ée]mon\b|\bpok[ée]\s?bola\b|\bpoke\s?ball\b|nintendo|game\s?freak',
     'referência ao universo Pokémon',
     'O logótipo já faz o trocadilho. Escrevê-lo em texto transforma uma '
     'paródia gráfica numa associação declarada a uma marca registada.'),
    (r'\bCASA\b\s*[-–—]\s*Centro\s+de\s+Arbitragem|Centro\s+de\s+Arbitragem\s+do\s+Sector\s+Autom[óo]vel',
     'CASA (Centro de Arbitragem do Sector Automóvel)',
     'Foi extinta em 10-01-2024. A entidade competente é o CICAP.'),
    (r'\bCNIACC\b', 'CNIACC',
     'É residual. São João da Madeira integra a Área Metropolitana do Porto e '
     'está expressamente coberta pelo CICAP (Despacho n.º 3077/2025).'),
]

# Ficheiros a inspeccionar: tudo o que o cliente pode editar, mais o que sai para o ar
ALVOS_DIR = ['data', 'legal']
ALVOS_FICH = ['index.html']
EXT = ('.json', '.html', '.md')


def textos_de(caminho):
    """Devolve (rótulo, texto) para cada pedaço inspeccionável do ficheiro."""
    if caminho.endswith('.json'):
        try:
            with open(caminho, encoding='utf-8') as f:
                dados = json.load(f)
        except ValueError as e:
            return [('(JSON inválido)', 'ERRO: %s' % e)]
        saida = []

        def andar(no, caminho_no):
            if isinstance(no, dict):
                for k, v in no.items():
                    andar(v, '%s.%s' % (caminho_no, k) if caminho_no else k)
            elif isinstance(no, list):
                for i, v in enumerate(no):
                    andar(v, '%s[%d]' % (caminho_no, i))
            elif isinstance(no, str):
                saida.append((caminho_no, no))
        andar(dados, '')
        return saida
    with open(caminho, encoding='utf-8') as f:
        return [('', f.read())]


def main():
    ficheiros = []
    for d in ALVOS_DIR:
        p = os.path.join(RAIZ, d)
        if os.path.isdir(p):
            for raiz, _, nomes in os.walk(p):
                ficheiros += [os.path.join(raiz, n) for n in sorted(nomes)
                              if n.endswith(EXT) and not n.startswith('_')]
    ficheiros += [os.path.join(RAIZ, f) for f in ALVOS_FICH
                  if os.path.exists(os.path.join(RAIZ, f))]

    achados = []
    for f in ficheiros:
        rel = os.path.relpath(f, RAIZ)
        for rotulo, texto in textos_de(f):
            for padrao, nome, remedio in REGRAS:
                m = re.search(padrao, texto, re.I)
                if m:
                    trecho = texto[max(0, m.start() - 40):m.end() + 40].replace('\n', ' ')
                    achados.append((rel, rotulo, nome, trecho.strip(), remedio))

    if not achados:
        print('termos: %d ficheiros verificados, nada proibido.' % len(ficheiros))
        return 0

    print('=' * 74)
    print('A PUBLICAÇÃO FOI TRAVADA — há texto que não pode ir para o site')
    print('=' * 74)
    for rel, rotulo, nome, trecho, remedio in achados:
        print()
        print('  ficheiro : %s%s' % (rel, ('  →  ' + rotulo) if rotulo else ''))
        print('  problema : %s' % nome)
        print('  texto    : …%s…' % trecho)
        print('  o que faz: %s' % remedio)
    print()
    print('O site continua a servir a versão anterior. Corrige e grava outra vez.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
