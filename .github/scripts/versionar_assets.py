# -*- coding: utf-8 -*-
"""
Assinatura de versão nos CSS/JS (anti-cache)
============================================
O GitHub Pages serve os assets com `cache-control: max-age=600`, por isso
depois de um deploy o browser pode continuar 10 minutos com o CSS/JS antigo —
ou pior, misturar HTML novo com JS velho.

Este script carimba ?v=<hash do conteúdo> em cada referência a CSS/JS nas
páginas HTML. Quando o ficheiro muda, o endereço muda e o browser vai buscar
a versão nova de imediato. Quando não muda, o hash é o mesmo e a cache continua
a funcionar como deve ser.

Os data/*.json não precisam: o app.js já os pede com cache:'no-cache', que é
o que faz as edições do backoffice aparecerem na hora.

Correr SEMPRE antes de fazer commit de alterações a CSS ou JS:
    python3 _source/build/versionar_assets.py
"""
import glob
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # .github/scripts/x.py -> raiz
PADRAO = re.compile(r'(?P<attr>href|src)="(?P<caminho>[^"?]*assets/(?:css|js)/[^"?]+)(?:\?v=[^"]*)?"')


def hash_curto(caminho_abs):
    with open(caminho_abs, 'rb') as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def versionar(pagina):
    rel = os.path.relpath(pagina, ROOT)
    base = os.path.dirname(pagina)
    original = open(pagina, encoding='utf-8').read()
    faltam = []

    def troca(m):
        alvo = os.path.normpath(os.path.join(base, m.group('caminho')))
        if not os.path.exists(alvo):
            faltam.append(m.group('caminho'))
            return m.group(0)
        return '%s="%s?v=%s"' % (m.group('attr'), m.group('caminho'), hash_curto(alvo))

    novo = PADRAO.sub(troca, original)
    for f in faltam:
        print('  AVISO: %s não existe (referenciado em %s)' % (f, rel))
    if novo != original:
        open(pagina, 'w', encoding='utf-8').write(novo)
        return len(PADRAO.findall(novo)), True
    return len(PADRAO.findall(novo)), False


def main():
    paginas = [os.path.join(ROOT, 'index.html')]
    paginas += sorted(glob.glob(os.path.join(ROOT, 'legal', '*.html')))
    paginas += [p for p in [os.path.join(ROOT, '404.html')] if os.path.exists(p)]

    alterados = 0
    for p in paginas:
        n, mudou = versionar(p)
        print('%-28s %d assets %s' % (os.path.relpath(p, ROOT), n, '(atualizado)' if mudou else '(já certo)'))
        alterados += 1 if mudou else 0
    print('\n%d de %d páginas atualizadas' % (alterados, len(paginas)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
