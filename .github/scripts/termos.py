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
    # --- emissões: qualquer forma de anular, e também os eufemismos do ramo ---
    (r'\b(anul\w*|remo[çc]\w*|remover|retirad\w*|retirar|elimina\w*|desactiv\w*|'
     r'desativ\w*|desligar|inibi\w*|by-?pass|delete|off\b|supress\w*|corte)\b'
     r'[\s\S]{0,60}?\b(fap|dpf|egr|catalisador|cataliz\w*|adblue|scr|sonda\s+lambda|'
     r'v[áa]lvula\s+egr|filtro\s+de\s+part[íi]culas)\b',
     'anulação/remoção de sistema de controlo de emissões',
     'Só se pode anunciar limpeza, regeneração ou substituição por peça homologada.'),
    (r'\b(fap|dpf|egr|adblue|catalisador|filtro\s+de\s+part[íi]culas)\b'
     r'[\s\S]{0,60}?\b(anul\w*|remo\w*|retirad\w*|elimina\w*|off\b|delete|'
     r'desactiv\w*|desativ\w*|programa\w*\s+(para\s+)?fora)\b',
     'anulação/remoção de sistema de controlo de emissões',
     'Só se pode anunciar limpeza, regeneração ou substituição por peça homologada.'),
    (r'\bdescarboniza\w*\b[\s\S]{0,40}?\b(fap|dpf|egr|motor)\b|\bstage\s*[123]\b|'
     r'\bchip\s*tuning\b|\bremap\w*\b|\breprograma\w*\s+(de\s+)?centralina',
     'reprogramação/potenciação de motor',
     'Alterações às características do veículo têm de ser homologadas pelo IMT '
     '(Código da Estrada art.114). Não anunciar sem homologação confirmada.'),

    # --- pirotecnia: airbags e pré-tensores ---
    (r'\bairbag', 'airbag',
     'Airbags e pré-tensores são pirotecnia P1 (DL 135/2015): não podem ser '
     'disponibilizados ao público. Retirar do catálogo de peças.'),
    (r'pr[ée]\s*-?\s*tensor|pretensor', 'pré-tensor de cinto',
     'Mesma regra dos airbags: pirotecnia P1, não pode ser vendido ao público.'),

    # --- garantia ---
    (r'sem\s+(qualquer\s+)?garantia|n[ãa]o\s+t[eê]m?\s+garantia|'
     r'garantia\s*[:=]?\s*(n[ãa]o|nenhuma|0\b)',
     'negação de garantia',
     'O DL 84/2021 dá 3 anos em peças novas e 18 meses no mínimo em usadas. '
     'A frase é nula e é prática comercial desleal.'),

    # --- alegações ambientais (Dir. (UE) 2024/825, desde 27-09-2026) ---
    (r'\b(ecol[óo]gic\w*|eco-?friendly|amig\w*\s+do\s+ambiente|sustent[áa]vel|'
     r'sustent[áa]veis|carbono\s+neutro|neutr\w*\s+em\s+carbono|zero\s+emiss[õo]es|'
     r'biodegrad[áa]vel|verde\b|100%\s*natural)\b',
     'alegação ambiental genérica',
     'A Diretiva (UE) 2024/825 proíbe estas alegações sem prova a partir de '
     '27-09-2026. Dizer o que se faz em concreto, não adjectivar.'),

    # --- superlativos sem prova (prática comercial enganosa, DL 57/2008) ---
    # Só superlativos SOBRE A EMPRESA. "O seu carro merece o melhor cuidado" é
    # uma frase sobre o carro, não uma alegação de que a oficina é a melhor —
    # e é a frase que o próprio cliente usa.
    (r'\b(somos|s[ãa]o)\s+(os\s+)?(melhor\w*|n[ºo°]?\s*1\b|l[íi]der\w*)|'
     r'\b[ao]s?\s+melhor\w*\s+(oficina|mec[âa]nic\w*|servi[çc]\w*|pre[çc]\w*|'
     r'empresa|equipa)\b|'
     r'\bl[íi]der\s+(de\s+mercado|do\s+sector|na\s+regi[ãa]o)|'
     r'\bos\s+mais\s+barat\w*|\bpre[çc]os?\s+imbat[íi]ve\w*|'
     r'\bgarantia\s+vital[íi]cia|\bsatisfa[çc][ãa]o\s+garantida\b',
     'superlativo sobre a empresa, sem prova',
     'O DL 57/2008 trata como enganosa a alegação que não se consegue demonstrar. '
     'Dizer o que se faz vale mais do que dizer que se é o melhor.'),

    # --- entidades e links errados ---
    (r'ec\.europa\.eu/(consumers/)?odr|plataforma\s+(europeia\s+)?de\s+resolu[çc][ãa]o\s+'
     r'de\s+lit[íi]gios(\s+em\s+linha)?',
     'plataforma ODR europeia',
     'Foi desligada e revogada em 20-07-2025 pelo Reg. (UE) 2024/3228. '
     'A entidade correcta para São João da Madeira é o CICAP.'),
    (r'Centro\s+de\s+Arbitragem\s+do\s+Sector\s+Autom[óo]vel|\bCASA\s*[-–—]\s*Centro',
     'CASA (Centro de Arbitragem do Sector Automóvel)',
     'Foi extinta em 10-01-2024. A entidade competente é o CICAP.'),
    (r'\bCNIACC\b', 'CNIACC',
     'É residual. São João da Madeira integra a Área Metropolitana do Porto e '
     'está expressamente coberta pelo CICAP (Despacho n.º 3077/2025).'),

    # --- marca ---
    (r'\bpok[ée]mon\b|\bpok[ée]\s?bola\b|\bpoke\s?ball\b|\bnintendo\b|'
     r'\bgame\s?freak\b|\bpikachu\b',
     'referência ao universo Pokémon',
     'O logótipo já faz o trocadilho. Escrevê-lo em texto transforma uma '
     'paródia gráfica numa associação declarada a uma marca registada.'),
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
    print('Nada foi publicado: o site continua com a última versão que passou.')
    print('Corrige no backoffice e grava outra vez.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
