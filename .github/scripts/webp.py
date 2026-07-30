# -*- coding: utf-8 -*-
"""
Variantes WebP das fotografias → assets/img/<pasta>/webp/
=========================================================
As fotos da galeria e dos catálogos são JPEG saídos do telemóvel: 31 ficheiros em
assets/img/trabalhos/ pesam 5,2 MB. Medido numa primeira carga a 1280px, um iPad
descarregava 1,6 MB só de galeria. Em WebP a mesma imagem pesa tipicamente 1/3.

Medido: a galeria mostra cada foto entre 160 e 356 px de CSS, ou seja 320 a 1068
px de aparelho. Por isso NÃO se gera variante à resolução original — poupava só
16-31% e nunca é o tamanho pedido. Geram-se duas larguras pequenas, que é onde
está o ganho a sério (442 KB → 146 KB na foto mais pesada).

O que este script faz, e o que NÃO faz:
  - gera, para cada foto, variantes WebP de 480 e 760 px de largura
  - grava-as numa subpasta webp/ ao lado do original, para não destruir nada
  - NÃO apaga nem substitui os JPEG: continuam a ser a origem do backoffice e a
    imagem que o lightbox abre em grande
  - é idempotente: só reconverte se o original for mais recente do que a variante

Corre antes do dimensoes.py e do prerender.py, no mesmo workflow.

Uso:  python3 .github/scripts/webp.py [--verificar] [--qualidade 82]
"""
import hashlib
import json
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
IMGS = os.path.join(RAIZ, 'assets', 'img')

# só as pastas de fotografia; logos e ícones ficam de fora (já são pequenos e
# alguns precisam de transparência exacta)
# Só as pastas cujas imagens são emitidas com srcset — ver srcsetWebp() em
# assets/js/app.js. 'pecas' entra porque é o cliente que vai lá carregar fotos
# tiradas com o telemóvel, que chegam com 4000px e vários MB.
PASTAS = ['trabalhos', 'pecas']
ORIGEM_EXT = ('.jpg', '.jpeg', '.png')
LARGURAS = [480, 760]
QUALIDADE = 82

# Onde fica o registo do que já foi convertido, e a partir de quê
MANIFESTO = os.path.join(IMGS, '.webp.json')


def variantes(caminho, larg_original):
    """Que ficheiros WebP devem existir para este original.

    Larguras pequenas para os ecrãs pequenos, MAIS uma à largura do original.
    Essa última é o tecto: com descritores `w` no srcset, o atributo src deixa de
    ser candidato, portanto sem ela nenhum ecrã conseguia chegar à resolução do
    ficheiro original — as fotos ficavam limitadas a 760 px (ou a 480 px nas
    quatro cujo original tem menos de 836 px). Nunca é escolhida sem ser
    precisa, e em WebP pesa cerca de 1/3 do JPEG equivalente."""
    base = os.path.splitext(os.path.basename(caminho))[0]
    pasta = os.path.join(os.path.dirname(caminho), 'webp')
    larguras = [w for w in LARGURAS if larg_original > w * 1.1]
    if larg_original not in larguras:
        larguras.append(larg_original)
    return [(os.path.join(pasta, '%s-%d.webp' % (base, w)), w) for w in sorted(larguras)]


def digerir(caminho):
    h = hashlib.sha1()
    with open(caminho, 'rb') as f:
        for bloco in iter(lambda: f.read(65536), b''):
            h.update(bloco)
    return h.hexdigest()


def carregar_manifesto():
    if os.path.exists(MANIFESTO):
        try:
            with open(MANIFESTO, encoding='utf-8') as f:
                return json.load(f)
        except ValueError:
            pass
    return {}


def main():
    verificar = '--verificar' in sys.argv
    qualidade = QUALIDADE
    if '--qualidade' in sys.argv:
        qualidade = int(sys.argv[sys.argv.index('--qualidade') + 1])

    # Antes comparavam-se datas de modificação. Num runner isso é inerte: o
    # actions/checkout escreve tudo de novo e por ordem alfabética, logo
    # ".../foto.jpg" fica SEMPRE com mtime anterior a ".../webp/foto-480.webp" e a
    # condição nunca era verdadeira. Uma foto substituída com o mesmo nome pelo
    # backoffice continuaria a servir a variante antiga para sempre — e, pior,
    # mostrava fotos diferentes conforme o ecrã. Agora compara-se o conteúdo.
    manifesto = carregar_manifesto()
    novo_manifesto = {}
    por_fazer, feitos, apagados = [], 0, []
    antes = depois = 0

    for nome in PASTAS:
        pasta = os.path.join(IMGS, nome)
        if not os.path.isdir(pasta):
            continue
        esperados = set()
        for f in sorted(os.listdir(pasta)):
            origem = os.path.join(pasta, f)
            if not os.path.isfile(origem) or not f.lower().endswith(ORIGEM_EXT):
                continue
            rel = os.path.relpath(origem, RAIZ).replace(os.sep, '/')
            sha = digerir(origem)
            novo_manifesto[rel] = sha
            mudou = manifesto.get(rel) != sha
            with Image.open(origem) as im:
                larg = im.size[0]
                for destino, alvo in variantes(origem, larg):
                    esperados.add(os.path.basename(destino))
                    if os.path.exists(destino) and not mudou:
                        continue
                    por_fazer.append(os.path.relpath(destino, RAIZ))
                    if verificar:
                        continue
                    os.makedirs(os.path.dirname(destino), exist_ok=True)
                    copia = im.convert('RGB')
                    if copia.size[0] > alvo:
                        h = round(copia.size[1] * alvo / copia.size[0])
                        copia = copia.resize((alvo, h), Image.LANCZOS)
                    copia.save(destino, 'WEBP', quality=qualidade, method=6)
                    feitos += 1
                    antes += os.path.getsize(origem)
                    depois += os.path.getsize(destino)

        # variantes cujo original desapareceu: sem isto o repositório só cresce
        pasta_webp = os.path.join(pasta, 'webp')
        if os.path.isdir(pasta_webp):
            for f in sorted(os.listdir(pasta_webp)):
                if f.endswith('.webp') and f not in esperados:
                    apagados.append(os.path.relpath(os.path.join(pasta_webp, f), RAIZ))
                    if not verificar:
                        os.remove(os.path.join(pasta_webp, f))

    if verificar:
        print('variantes WebP a gerar: %d | órfãs a apagar: %d'
              % (len(por_fazer), len(apagados)))
        for p in (por_fazer + apagados)[:10]:
            print('  ', p)
        return 1 if (por_fazer or apagados) else 0

    with open(MANIFESTO, 'w', encoding='utf-8') as f:
        json.dump(novo_manifesto, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')

    if feitos or apagados:
        print('%d variantes WebP geradas, %d órfãs apagadas (qualidade %d)'
              % (feitos, len(apagados), qualidade))
        if feitos:
            print('  originais somados: %.1f MB  →  variantes: %.1f MB'
                  % (antes / 1e6, depois / 1e6))
    else:
        print('variantes WebP já estavam em dia')
    return 0


if __name__ == '__main__':
    sys.exit(main())
