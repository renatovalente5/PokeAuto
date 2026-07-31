# -*- coding: utf-8 -*-
"""
Cartão de partilha (assets/img/og.jpg) — 1200x630
==================================================
É a imagem que aparece quando alguém partilha o site no WhatsApp, no Facebook
ou no Messenger. Durante um tempo foi só um recorte da fotografia do topo, e
perdeu-se o que a tornava útil: sem o logótipo e sem o nome da terra, um
recorte de uma jante não diz a ninguém de quem é o link.

O cartão é DESENHADO, não recortado: fotografia de fundo escurecida, logótipo,
filete dourado, título e a linha de serviços. E é gerado a partir do
data/site.json, para não ficar a mentir no dia em que o cliente mudar o título
no backoffice.

Como é feito: escreve-se um HTML temporário, serve-se a pasta do projecto num
servidor local e fotografa-se em Chrome headless a 1200x630. Assim usa as
fontes auto-alojadas e as cores da marca — em vez de as reinventar com uma
biblioteca de imagem, que foi o que deu a tipografia genérica da primeira versão.

Corre depois do webp.py e antes do prerender.py.

Uso:  python3 .github/scripts/og.py [--verificar]
"""
import hashlib
import json
import os
import socket
import socketserver
import sys
import threading
import http.server

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, AQUI)

DESTINO = os.path.join(RAIZ, 'assets', 'img', 'og.jpg')
TEMP_HTML = os.path.join(RAIZ, '_og.html')
LARGURA, ALTURA = 1200, 630

PADRAO = {
    'titulo': 'Oficina auto em São João da Madeira',
    'subtitulo': 'Mecânica · Eletricidade · Eletrónica · Revisões · Lavagens',
    'foto': 'faixa-jante',
}


def esc(t):
    return (str(t).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def ler_site():
    with open(os.path.join(RAIZ, 'data', 'site.json'), encoding='utf-8') as f:
        return json.load(f)


def escolher_foto(nome):
    """Maior variante disponível daquele nome base, ou a jante como recurso."""
    pasta = os.path.join(RAIZ, 'assets', 'img', 'trabalhos')
    base = os.path.splitext(os.path.basename(str(nome or '')))[0]
    import re
    base = re.sub(r'-\d{2,4}$', '', base) or PADRAO['foto']
    cands = []
    for f in os.listdir(pasta):
        m = re.match(r'^' + re.escape(base) + r'-(\d+)\.webp$', f)
        if m:
            cands.append((int(m.group(1)), 'assets/img/trabalhos/' + f))
    if not cands:
        return 'assets/img/trabalhos/faixa-jante-1800.webp'
    return max(cands)[1]


def montar_html(og):
    foto = escolher_foto(og.get('foto'))
    return """<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/css/fonts.css">
<style>
  /* Sem o base.css de propósito: só as fontes. O base.css tem uma regra
     global para as imagens, pensada para a página, que aqui só cria
     surpresas. */
  :root{--dourado:#F5B921;--prata:#C9CFD6;--preto:#0B0B0D;
    --f-display:'Barlow Condensed','Arial Narrow',sans-serif;
    --f-corpo:'Barlow',system-ui,sans-serif;}
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{background:var(--preto);}
  .og{position:relative;width:%(w)dpx;height:%(h)dpx;overflow:hidden;
      font-family:var(--f-corpo);}
  .og__foto{position:absolute;inset:0;width:100%%;height:100%%;object-fit:cover;
      object-position:50%% 46%%;display:block;}
  /* Véu forte do lado esquerdo, onde assenta o texto, e leve à direita, para a
     fotografia continuar a ler-se. */
  .og__veu{position:absolute;inset:0;
      background:linear-gradient(100deg, rgba(9,9,11,.94) 0%%, rgba(9,9,11,.82) 40%%,
                 rgba(9,9,11,.46) 68%%, rgba(9,9,11,.30) 100%%);}
  .og__corpo{position:absolute;inset:0;display:flex;flex-direction:column;
      /* flex-start e não o stretch por omissão: numa coluna, o stretch estica
         o logótipo a toda a largura e deforma-o. */
      align-items:flex-start;justify-content:space-between;
      padding:50px 60px 52px;}
  .og__logo{width:300px;height:auto;display:block;
      filter:drop-shadow(0 6px 22px rgba(0,0,0,.55));}
  .og__filete{width:64px;height:6px;border-radius:3px;background:var(--dourado);
      margin-bottom:20px;}
  .og__tit{font-family:var(--f-display);font-weight:700;text-transform:uppercase;
      font-size:%(ft)dpx;line-height:1;letter-spacing:-.01em;color:#fff;
      text-shadow:0 3px 18px rgba(0,0,0,.55);}
  .og__sub{margin-top:14px;font-size:29px;line-height:1.25;color:var(--prata);
      text-shadow:0 2px 12px rgba(0,0,0,.55);}
</style></head><body>
<div class="og">
  <img class="og__foto" src="%(foto)s" alt="">
  <div class="og__veu"></div>
  <div class="og__corpo">
    <img class="og__logo" src="assets/img/logo-760.webp" alt="">
    <div>
      <div class="og__filete"></div>
      <h1 class="og__tit">%(tit)s</h1>
      <p class="og__sub">%(sub)s</p>
    </div>
  </div>
</div>
</body></html>""" % {
        'w': LARGURA, 'h': ALTURA, 'foto': esc(foto),
        'tit': esc(og.get('titulo') or PADRAO['titulo']),
        'sub': esc(og.get('subtitulo') or PADRAO['subtitulo']),
        # títulos longos encolhem, para nunca transbordarem do cartão
        'ft': 62 if len(str(og.get('titulo') or PADRAO['titulo'])) <= 38 else 52,
    }


def porta_livre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def gerar(html):
    from cdp import Chrome
    import base64

    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    porta = porta_livre()
    srv = socketserver.TCPServer(
        ('127.0.0.1', porta), lambda *a, **k: Silencioso(*a, directory=RAIZ, **k))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with open(TEMP_HTML, 'w', encoding='utf-8') as f:
        f.write(html)
    c = Chrome(porta=porta_livre())
    try:
        c.cmd('Emulation.setDeviceMetricsOverride', width=LARGURA, height=ALTURA,
              deviceScaleFactor=2, mobile=False)
        c.abrir('http://127.0.0.1:%d/_og.html' % porta, espera=3.0)
        # as fontes têm de estar carregadas antes da fotografia
        c.js("document.fonts && document.fonts.ready")
        import time
        time.sleep(1.6)
        r = c.cmd('Page.captureScreenshot', format='png')
        bruto = base64.b64decode(r['data'])
    finally:
        c.fechar()
        srv.shutdown()
        if os.path.exists(TEMP_HTML):
            os.remove(TEMP_HTML)

    from PIL import Image
    import io
    im = Image.open(io.BytesIO(bruto)).convert('RGB')
    if im.size != (LARGURA, ALTURA):
        im = im.resize((LARGURA, ALTURA), Image.LANCZOS)
    im.save(DESTINO, 'JPEG', quality=88, optimize=True, progressive=True)
    return os.path.getsize(DESTINO)


def marcar_urls(marca):
    """Actualiza ?v= nos metadados de partilha das quatro páginas."""
    import glob
    import re
    alvos = [os.path.join(RAIZ, 'index.html')] + sorted(glob.glob(os.path.join(RAIZ, 'legal', '*.html')))
    mudados = 0
    for p in alvos:
        with open(p, encoding='utf-8') as f:
            s = f.read()
        novo = re.sub(r'(assets/img/og\.jpg)(\?v=[0-9a-f]+)?', r'\1?v=' + marca, s)
        if novo != s:
            with open(p, 'w', encoding='utf-8') as f:
                f.write(novo)
            mudados += 1
    if mudados:
        print('og: %d páginas com o novo endereço da imagem' % mudados)


def main():
    verificar = '--verificar' in sys.argv
    site = ler_site()
    og = site.get('og') or {}
    html = montar_html(og)

    # A assinatura muda quando muda o conteúdo do cartão. Sem isto, o workflow
    # regenerava o JPEG a cada publicação e o repositório crescia com um
    # ficheiro binário diferente de cada vez, sem nada ter mudado.
    marca = hashlib.sha1(html.encode('utf-8')).hexdigest()[:12]
    reg = os.path.join(RAIZ, 'assets', 'img', '.og.json')
    try:
        with open(reg, encoding='utf-8') as f:
            anterior = json.load(f).get('assinatura')
    except (IOError, ValueError):
        anterior = None

    if anterior == marca and os.path.exists(DESTINO):
        # O ficheiro está bem, mas as páginas podem não estar: uma página nova
        # nasce sem o ?v=. Marcar é barato e mantém tudo coerente.
        marcar_urls(marca)
        print('og: cartão de partilha já em dia.')
        return 0
    if verificar:
        print('og: cartão de partilha desactualizado.')
        return 1

    try:
        tam = gerar(html)
    except Exception as e:
        # Não travar a publicação por causa da imagem de partilha: o site
        # continua correcto, só a pré-visualização é que fica a anterior.
        print('og: não foi possível gerar (%s). Fica a imagem anterior.' % e)
        return 0
    with open(reg, 'w', encoding='utf-8') as f:
        json.dump({'assinatura': marca}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    # O WhatsApp e o Facebook guardam a pré-visualização pelo URL. Sem mudar o
    # URL, quem já partilhou o link continuava a ver o cartão antigo durante
    # semanas. A versão vai no endereço, não no nome do ficheiro, para o
    # ficheiro em si continuar a ser assets/img/og.jpg.
    marcar_urls(marca)
    print('og: cartão de partilha gerado (%.0f KB)' % (tam / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
