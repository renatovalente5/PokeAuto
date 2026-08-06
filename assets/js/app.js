/* =============================================================
   POKEAUTO — app.js
   Desenha as secções a partir de data/*.json (o que o cliente edita no
   backoffice) e trata dos comportamentos: navbar que encolhe, menu de ecrã
   inteiro, mapa por clique.

   Nota de arquitectura: o HTML servido já traz este conteúdo congelado pelo
   .github/scripts/prerender.py, entre marcadores <!--pre:id-->. Este ficheiro
   redesenha por cima em runtime. Por isso os .catch() são silenciosos: se um
   fetch falhar, o que já está no HTML fica de pé — substituí-lo por "não foi
   possível carregar" seria pior, porque é ISSO que o Google indexaria.
   ============================================================= */
(function () {
  'use strict';
  var doc = document;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* A raiz do site, calculada a partir do caminho do próprio script. Sem isto,
     'data/site.json' resolvia para /legal/data/site.json nas páginas legais —
     404 engolido pelo .catch — e o bloco de identificação legal ficava para
     sempre a dizer "[por confirmar]", precisamente nas páginas onde a caixa se
     intitula "Identificação (DL n.º 7/2004)". */
  var RAIZ = (function () {
    var e = doc.currentScript || doc.querySelector('script[src*="app.js"]');
    var src = e ? e.getAttribute('src') : '';
    return src.replace(/assets\/js\/app\.js.*$/, '');
  })();
  function getJSON(url) {
    return fetch(RAIZ + url, { cache: 'default' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function el(id) { return doc.getElementById(id); }

  /* Dimensões reais das imagens, geradas no build por dimensoes.py. Sem
     width/height o browser não reserva espaço, as fotos colapsam todas dentro
     do primeiro ecrã e o loading="lazy" deixa de adiar seja o que for. */
  var DIMS = {};
  var TELEFONE_INTL = '';
  var dimsProntas = getJSON('data/_dimensoes.json')
    .then(function (d) { DIMS = d || {}; })
    .catch(function () { });
  function attrsDim(src) {
    var d = DIMS[String(src).replace(/^\/+/, '').split('?')[0]];
    return d ? ' width="' + d[0] + '" height="' + d[1] + '"' : '';
  }

  /* ------------------------------------------------------- FOTOGRAFIAS

     O backoffice guarda o que o cliente escolheu na biblioteca de imagens —
     um caminho completo, com extensão, e às vezes já com largura no nome:

         assets/img/trabalhos/porsche.jpg
         assets/img/trabalhos/porsche-840.webp
         porsche                                (o formato antigo, à mão)

     O site precisa do NOME BASE para poder montar o srcset a partir das
     variantes que o webp.py gerou. Isto normaliza os três casos. Sem esta
     função, uma fotografia carregada pelo cliente aparecia partida — e o
     backoffice deixava de ser autónomo na prática. */
  var LARGURAS_FOTO = [320, 400, 420, 480, 560, 640, 760, 840, 960, 1280, 1800];

  function baseDaFoto(valor) {
    var v = String(valor || '').trim();
    if (!v) return '';
    v = v.split('?')[0].split('/').pop();          /* tira a pasta */
    v = v.replace(/\.(webp|jpe?g|png|avif)$/i, ''); /* tira a extensão */
    v = v.replace(/-\d{2,4}$/, '');                 /* tira a largura, se lá estiver */
    return v;
  }

  /* Devolve {src, srcset, larguras} para um valor do backoffice, ou null se
     não houver nenhuma variante gerada para aquele nome. */
  function resolverFoto(valor, pasta, minimo) {
    var base = baseDaFoto(valor);
    if (!base) return null;
    var raiz = 'assets/img/' + (pasta || 'trabalhos') + '/' + base;
    var disp = LARGURAS_FOTO.filter(function (w) { return DIMS[raiz + '-' + w + '.webp']; });
    if (!disp.length) {
      /* Sem variantes ainda (o workflow pode não ter corrido): serve-se o
         original tal como veio, que é melhor do que uma imagem partida. */
      var cru = String(valor || '').trim();
      if (cru && cru.indexOf('/') !== -1) return { src: cru, srcset: '', larguras: [] };
      return null;
    }
    /* O `src` é só o recurso de recurso — com srcset+sizes o browser escolhe da
       lista. Mesmo assim, numa imagem servida a 100vw uma miniatura de 640 como
       fallback dava uma primeira pintura desfocada em quem não tem srcset. */
    var alvo = minimo || 640;
    return {
      src: raiz + '-' + (disp.filter(function (w) { return w >= alvo; })[0] || disp[disp.length - 1]) + '.webp',
      srcset: disp.map(function (w) { return raiz + '-' + w + '.webp ' + w + 'w'; }).join(', '),
      larguras: disp
    };
  }

  /* Escreve a <img> completa a partir do valor do backoffice. */
  function imgDe(valor, alt, sizes, pasta, extra) {
    var f = resolverFoto(valor, pasta);
    if (!f) return '';
    return '<img src="' + esc(f.src) + '"' +
      (f.srcset ? ' srcset="' + esc(f.srcset) + '" sizes="' + esc(sizes || '100vw') + '"' : '') +
      ' alt="' + esc(alt || '') + '" loading="lazy" decoding="async"' +
      attrsDim(f.src) + (extra || '') + ' />';
  }

  /* ------------------------------------------------- revelação ao entrar */
  var revIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (ens, o) {
    ens.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); o.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .05 }) : null;
  function revelar(escopo) {
    var els = (escopo || doc).querySelectorAll('[data-reveal]:not(.is-in)');
    if (!revIO) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    els.forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (r.top < (window.innerHeight || 0) && r.bottom > 0) e.classList.add('is-in');
      else revIO.observe(e);
    });
  }

  /* ==================================================== NAVBAR + MENU */
  var nav = doc.querySelector('.nav');
  var toggle = el('nav-toggle');
  var menu = el('menu');

  /* O logótipo entra grande e encolhe ao descer (pedido do cliente). O limiar
     tem histerese — 90px para encolher, 40px para voltar a crescer — senão a
     barra tremia quem parasse o scroll em cima do valor exacto. */
  if (nav) {
    var encolhida = false;
    var aplicarNav = function () {
      var y = window.scrollY || doc.documentElement.scrollTop;
      if (!encolhida && y > 90) { encolhida = true; nav.classList.add('is-scrolled'); }
      else if (encolhida && y < 40) { encolhida = false; nav.classList.remove('is-scrolled'); }
      /* O botão flutuante do WhatsApp não aparece no topo: ali já há dois
         botões grandes no hero, e um terceiro a flutuar por cima só tapava a
         fotografia. A classe vive no <html> para o CSS a poder usar em
         qualquer sítio da página. */
      doc.documentElement.classList.toggle('desceu', y > 260);
    };
    var pendente = false;
    window.addEventListener('scroll', function () {
      if (pendente) return;
      pendente = true;
      requestAnimationFrame(function () { aplicarNav(); pendente = false; });
    }, { passive: true });
    aplicarNav();
  }

  /* O painel tapa o ecrã todo mas o resto da página continuava a existir para o
     teclado: ao 8.º Tab o foco saltava para trás do painel preto, sem anel
     visível e arrastando o scroll. Agora o fundo fica inerte e a tabulação dá a
     volta dentro do painel. */
  var FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
  var fundo = [doc.querySelector('main'), doc.querySelector('.rodape'),
               doc.querySelector('.barra-acao'), doc.querySelector('.salta-para')].filter(Boolean);

  function fundoInerte(sim) {
    fundo.forEach(function (n) {
      if (sim) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
    });
  }

  function fecharMenu() {
    if (!doc.body.classList.contains('menu-aberto')) return;
    doc.body.classList.remove('menu-aberto');
    fundoInerte(false);
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menu');
    }
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var aberto = doc.body.classList.toggle('menu-aberto');
      toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      /* O botão não tem texto visível, portanto o aria-label é o único nome que
         um leitor de ecrã anuncia. Deixá-lo em "Abrir menu" com o menu aberto
         faz o nome contradizer o estado. */
      toggle.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
      fundoInerte(aberto);
      if (aberto) {
        var p = el('menu-fechar') || menu.querySelector('a');
        if (p) p.focus({ preventScroll: true });
      }
    });

    /* prender o foco: Tab no último volta ao primeiro, Shift+Tab no primeiro
       vai para o último. O botão de fechar entra no ciclo. */
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !doc.body.classList.contains('menu-aberto')) return;
      var itens = [].slice.call(menu.querySelectorAll(FOCAVEIS))
        .filter(function (n) { return n.offsetParent !== null; });
      if (!itens.length) return;
      var primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && doc.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && doc.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      else if (itens.indexOf(doc.activeElement) === -1) { e.preventDefault(); primeiro.focus(); }
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) fecharMenu();
    });
    /* O painel está acima da navbar, por isso o hambúrguer fica por trás dele e
       não se pode clicar. O fecho é um botão próprio, dentro do painel. */
    var btFechar = el('menu-fechar');
    if (btFechar) btFechar.addEventListener('click', function () {
      fecharMenu();
      if (toggle) toggle.focus({ preventScroll: true });
    });

    /* tocar no logótipo com o menu aberto tem de o fechar */
    doc.querySelectorAll('[data-fecha-menu]').forEach(function (n) {
      n.addEventListener('click', fecharMenu);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && doc.body.classList.contains('menu-aberto')) {
        fecharMenu();
        toggle.focus();
      }
    });
    /* Se rodar o telemóvel e passar a caber o menu normal, o de ecrã inteiro
       tem de sair — senão fica um painel preto por cima de um site que já tem
       navegação visível. */
    window.matchMedia('(min-width: 861px)').addEventListener('change', function (e) {
      if (e.matches) fecharMenu();
    });
  }

  /* Marca no menu a secção em que o visitante está */
  var alvos = [].slice.call(doc.querySelectorAll('main section[id]'));
  if (alvos.length && 'IntersectionObserver' in window) {
    var links = {};
    doc.querySelectorAll('.nav__link[href^="#"]').forEach(function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    /* Guarda-se o conjunto das secções dentro da banda e decide-se a partir
       dele. Antes só se marcava ao ENTRAR numa secção: no topo da página só o
       hero está na banda, e o hero não tem link — logo nada limpava a marca e
       «Serviços» ficava aceso depois de o visitante voltar ao início. */
    var visiveis = {};
    var io = new IntersectionObserver(function (ens) {
      ens.forEach(function (e) {
        if (e.isIntersecting) visiveis[e.target.id] = true;
        else delete visiveis[e.target.id];
      });
      /* a secção mais acima na página é a que manda */
      var actual = null;
      for (var i = 0; i < alvos.length; i++) {
        if (visiveis[alvos[i].id] && links[alvos[i].id]) { actual = alvos[i].id; break; }
      }
      Object.keys(links).forEach(function (k) {
        links[k].classList.toggle('is-actual', k === actual);
        if (k === actual) links[k].setAttribute('aria-current', 'true');
        else links[k].removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    alvos.forEach(function (s) { io.observe(s); });
  }

  /* ============================================ CONTEÚDO EDITÁVEL (site) */
  Promise.all([getJSON('data/site.json'), dimsProntas]).then(function (rr) {
    var site = rr[0];

    /* --- topo da página: título com realce, fotografia e cabeçalho ------- */
    /* O realce é uma expressão que o cliente escreve à parte, em vez de HTML.
       Se a expressão não existir no título, o título aparece inteiro sem
       realce — nunca com <em> a meio de uma palavra. */
    var h1 = el('hero-titulo');
    if (h1 && site.hero && site.hero.titulo) {
      var t = String(site.hero.titulo);
      var dq = String(site.hero.destaque || '').trim();
      var k = dq ? t.toLowerCase().indexOf(dq.toLowerCase()) : -1;
      h1.innerHTML = (k === -1)
        ? esc(t)
        : esc(t.slice(0, k)) + '<em>' + esc(t.slice(k, k + dq.length)) + '</em>' + esc(t.slice(k + dq.length));
    }
    var heroFundo = doc.querySelector('.hero__fundo');
    if (heroFundo && site.hero && site.hero.foto) {
      var hf = resolverFoto(site.hero.foto, 'trabalhos', 1280);
      if (hf) {
        heroFundo.innerHTML = '<img src="' + esc(hf.src) + '"' +
          (hf.srcset ? ' srcset="' + esc(hf.srcset) + '" sizes="100vw"' : '') +
          ' alt=""' + attrsDim(hf.src) + ' fetchpriority="high" />';
      }
    }
    aplicarHead(el('contactos'), site.contactos_head);

    /* --- faixa de textura ----------------------------------------------- */
    var faixa = doc.querySelector('.faixa');
    if (faixa && site.faixa) {
      var ff = resolverFoto(site.faixa.foto, 'trabalhos', 1280);
      var ftx = String(site.faixa.texto || '');
      var fdq = String(site.faixa.destaque || '').trim();
      var fk = fdq ? ftx.toLowerCase().indexOf(fdq.toLowerCase()) : -1;
      var frase = (fk === -1) ? esc(ftx)
        : esc(ftx.slice(0, fk)) + '<em>' + esc(ftx.slice(fk, fk + fdq.length)) + '</em>' + esc(ftx.slice(fk + fdq.length));
      faixa.innerHTML =
        (ff ? '<img src="' + esc(ff.src) + '"' +
          (ff.srcset ? ' srcset="' + esc(ff.srcset) + '" sizes="100vw"' : '') +
          ' alt="" loading="lazy"' + attrsDim(ff.src) + ' />' : '') +
        '<div class="faixa__txt"><p>' + frase + '</p></div>';
    }

    var c = site.contactos || {};
    TELEFONE_INTL = c.telefone_intl || '';

    function val(caminho) {
      return caminho.split('.').reduce(function (o, k) { return o && o[k]; }, site);
    }
    /* Um campo apagado no backoffice TEM de desaparecer do site. Antes o
       `if (v)` deixava lá o texto antigo, e o cliente ficava convencido de que
       tinha apagado. Se o valor vier vazio, o nó é escondido. */
    doc.querySelectorAll('[data-site]').forEach(function (n) {
      var v = val(n.getAttribute('data-site'));
      if (v == null || v === '') { n.textContent = ''; n.hidden = true; }
      else { n.textContent = v; n.hidden = false; }
    });

    if (c.telefone_intl) {
      doc.querySelectorAll('[data-tel]').forEach(function (a) {
        a.setAttribute('href', 'tel:+' + c.telefone_intl);
      });
      doc.querySelectorAll('a[href*="wa.me/"]').forEach(function (a) {
        a.setAttribute('href', a.getAttribute('href').replace(/wa\.me\/\d+/, 'wa.me/' + c.telefone_intl));
      });
    }
    if (c.email) {
      doc.querySelectorAll('[data-mail]').forEach(function (a) {
        a.setAttribute('href', 'mailto:' + c.email);
      });
    }
    if (c.instagram_url) {
      doc.querySelectorAll('[data-ig]').forEach(function (a) { a.setAttribute('href', c.instagram_url); });
    }
    /* O Facebook só existe se houver URL. Um ícone que leva a lado nenhum é
       pior do que ícone nenhum. */
    doc.querySelectorAll('[data-fb]').forEach(function (a) {
      if (c.facebook_url) { a.setAttribute('href', c.facebook_url); a.hidden = false; }
      else a.remove();
    });

    /* horário: só aparece se estiver preenchido. Um horário errado é pior do
       que horário nenhum — manda gente à porta fechada. */
    /* O item do horário é preenchido por inteiro (ícone + lista) ou fica vazio.
       Um horário errado manda gente à porta fechada, por isso vazio é melhor do
       que inventado — e um contentor vazio some por CSS. */
    var horBox = el('contacto-horario');
    if (horBox) {
      var DIAS = { Monday: 'Segunda', Tuesday: 'Terça', Wednesday: 'Quarta',
                   Thursday: 'Quinta', Friday: 'Sexta', Saturday: 'Sábado', Sunday: 'Domingo' };
      var ORDEM = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      var blocos = (site.horario || []).filter(function (b) {
        return b && b.dias && b.dias.length && b.abre && b.fecha;
      });
      if (!blocos.length) {
        horBox.innerHTML = '';
      } else {
        var linhas = blocos.map(function (b) {
          /* "Segunda a Sexta" só se os dias forem MESMO seguidos. Segunda,
             quarta e sexta não é um intervalo. */
          var brutos = (typeof b.dias === 'string' ? [b.dias] : b.dias).slice()
            .sort(function (x, y) { return ORDEM.indexOf(x) - ORDEM.indexOf(y); });
          var seguidos = brutos.every(function (d, i) {
            return i === 0 || ORDEM.indexOf(d) === ORDEM.indexOf(brutos[i - 1]) + 1;
          });
          var ds = brutos.map(function (d) { return DIAS[d] || d; });
          var rot = (seguidos && ds.length > 2) ? ds[0] + ' a ' + ds[ds.length - 1]
                  : ds.length === 2 ? ds.join(' e ') : ds.join(', ');
          return '<li><span>' + esc(rot) + '</span> <span class="mono">' +
                 esc(b.abre) + '–' + esc(b.fecha) + '</span></li>';
        }).join('');
        horBox.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/></svg>' +
          '<div><strong>Horário</strong><ul class="meta">' + linhas + '</ul></div>';
      }
    }

    montarLegal(site);
  }).catch(function () { });

  /* --------------------------------------------------------- bloco legal */
  /* O que aparece muda com a forma jurídica. Não é preferência: o Código das
     Sociedades Comerciais art.171 obriga uma sociedade a publicar NIPC,
     conservatória, matrícula e capital social nos sítios na Internet; um
     empresário em nome individual não tem esse dever. */
  function montarLegal(site) {
    var alvo = el('bloco-legal');
    if (!alvo) return;
    var L = site.legal || {};
    var c = site.contactos || {};
    var morada = [c.morada_linha1, c.morada_linha2].filter(Boolean).join(', ');
    var p = [];

    if (L.forma_juridica === 'sociedade') {
      p.push(esc(L.nome_titular || '[firma por confirmar]'));
      if (morada) p.push('Sede: ' + esc(morada));
      p.push('NIPC ' + esc(L.nipc || '[por confirmar]'));
      if (L.conservatoria) p.push('Matriculada na Conservatória do Registo Comercial de ' +
        esc(L.conservatoria) + (L.matricula ? ' sob o n.º ' + esc(L.matricula) : ''));
      if (L.capital_social) p.push('Capital social: ' + esc(L.capital_social));
    } else {
      p.push(esc(L.nome_titular || '[nome do titular por confirmar]') +
             ', Empresário em Nome Individual, que usa a designação comercial «' +
             esc(L.designacao_comercial || 'PokeAuto') + '»');
      if (morada) p.push('Estabelecimento: ' + esc(morada));
      p.push('NIF ' + esc(L.nif || '[por confirmar]'));
    }
    if (c.email) p.push('Email: ' + esc(c.email));
    alvo.innerHTML = p.join(' · ');
  }

  /* ======================================== CONSENTIMENTO E MAPA ========
     O site não instala cookies nenhuns por si. O único caso é o mapa do Google,
     e por isso o consentimento é pedido só para isso — não há categorias a
     fingir nem "cookies de desempenho" que não existem.

     A escolha é guardada em localStorage. Guardar a própria escolha é
     estritamente necessário para cumprir o dever de a respeitar: sem isso o
     banner voltava a aparecer a cada visita e o "recusar" não valia nada.
     ==================================================================== */
  var CHAVE = 'pokeauto-cookies';

  function escolha() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }
  function guardar(v) {
    try { localStorage.setItem(CHAVE, v); } catch (e) { /* modo privado */ }
  }

  function carregarMapa() {
    var caixa = el('mapa');
    if (!caixa || caixa.querySelector('iframe')) return;
    var morada = caixa.getAttribute('data-morada') || 'PokeAuto São João da Madeira';
    var ifr = doc.createElement('iframe');
    /* z=16 mostrava meia vila: a oficina ficava um alfinete entre restaurantes.
       z=17 põe a rua como assunto sem perder as referências à volta. */
    ifr.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(morada) +
              '&z=17&hl=pt&output=embed';
    ifr.title = 'Mapa da localização da PokeAuto na Rua da Liberdade, São João da Madeira';
    ifr.loading = 'lazy';
    ifr.referrerPolicy = 'no-referrer-when-downgrade';
    caixa.innerHTML = '';
    caixa.appendChild(ifr);
  }

  var painel = el('cookies');
  var focoAnterior = null;

  function mostrarPainel() {
    if (!painel) return;
    focoAnterior = doc.activeElement;
    painel.hidden = false;
    var b = el('cookies-aceitar');
    if (b) b.focus({ preventScroll: true });
  }
  function fecharPainel() {
    if (!painel) return;
    painel.hidden = true;
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus({ preventScroll: true });
  }
  function decidir(v) {
    guardar(v);
    fecharPainel();
    if (v === 'sim') carregarMapa();
  }

  if (painel) {
    var e1 = el('cookies-aceitar'), e2 = el('cookies-recusar'), e3 = el('cookies-abrir');
    if (e1) e1.addEventListener('click', function () { decidir('sim'); });
    if (e2) e2.addEventListener('click', function () { decidir('nao'); });
    /* Reabrir as definições tem de ser tão fácil como aceitar (RGPD art.7/3).
       O botão está na fila dos links legais, em todas as páginas. */
    if (e3) e3.addEventListener('click', function () { mostrarPainel(); });
    /* Escape fecha SEM decidir: fechar não é consentir. */
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !painel.hidden) fecharPainel();
    });

    var j = escolha();
    if (j === 'sim') carregarMapa();
    else if (j !== 'nao') mostrarPainel();
  }

  /* O botão sobre a fotografia carrega o mapa e regista o consentimento — é a
     mesma decisão, tomada no sítio onde ela interessa. */
  var btMapa = el('mapa-aceitar');
  if (btMapa) btMapa.addEventListener('click', function () { decidir('sim'); });

  /* ================================================================ SERVIÇOS */
  var svcGrid = el('servicos-lista');
  if (svcGrid) {
    Promise.all([getJSON('data/servicos.json'), dimsProntas]).then(function (r) {
      var d = r[0];
      aplicarHead(el('servicos'), d.head);
      var itens = (d && d.itens) || [];

      svcGrid.innerHTML = itens.map(function (s, i) {
        var capa = resolverFoto(s.foto, 'trabalhos');
        var src = capa ? capa.src : '';
        var ss = capa ? capa.srcset : '';
        /* âncoras antigas: os serviços que foram agrupados mantêm o id, senão
           um link que já ande por aí deixa de ir a lado nenhum */
        var alias = (s.alias || []).map(function (a) {
          return '<span id="servico-' + esc(a) + '"></span>'; }).join('');
        /* as 9 zonas de rato; em telemóvel nunca correm (hover:hover) */
        var zonas = new Array(9).join('<i></i>') + '<i></i>';
        /* Galeria do detalhe. Só fotografias que existem mesmo: as faixas
           nasceram 3:1 e são apresentadas como banda larga, não como retrato. */
        var galeria = (s.fotos && s.fotos.length ? s.fotos : (s.foto ? [{ nome: s.foto, legenda: s.legenda_foto }] : []))
          .map(function (f) {
            var larga = baseDaFoto(f.nome).indexOf('faixa-') === 0;
            var r = resolverFoto(f.nome, 'trabalhos');
            if (!r) return '';
            var fs = r.srcset, fsrc = r.src;
            return '<figure class="folha__foto' + (larga ? ' folha__foto--larga' : '') + '">' +
              '<img src="' + esc(fsrc) + '"' +
              (fs ? ' srcset="' + esc(fs) + '" sizes="(max-width:48rem) 92vw, 20rem"' : '') +
              ' alt="' + esc(f.legenda || s.titulo) + '" loading="lazy" decoding="async"' +
              attrsDim(fsrc) + ' />' +
              (f.legenda ? '<figcaption>' + esc(f.legenda) + '</figcaption>' : '') +
              '</figure>';
          }).join('');
        /* Carrossel. A pista é um scroller com scroll-snap: no telemóvel
           arrasta-se com o dedo e no teclado navega-se com as setas, tudo
           nativo. As setas e os pontos são só um atalho por cima disso — sem
           JavaScript o CSS empilha as fotografias e esconde os controlos. */
        var nFotos = (galeria.match(/<figure/g) || []).length;
        var carrossel = '';
        if (nFotos) {
          var pontos = '';
          if (nFotos > 1) {
            for (var k = 0; k < nFotos; k++) {
              pontos += '<button class="carrossel__ponto" type="button" data-ir="' + k + '"' +
                (k === 0 ? ' aria-current="true"' : '') +
                ' aria-label="Fotografia ' + (k + 1) + ' de ' + nFotos + '"></button>';
            }
          }
          carrossel = '<div class="carrossel" data-carrossel>' +
            '<div class="carrossel__pista" tabindex="0" role="group" aria-label="Fotografias — ' + esc(s.titulo) + '">' +
            galeria + '</div>' +
            (nFotos > 1
              ? '<button class="carrossel__seta carrossel__seta--ant" type="button" data-passo="-1" aria-label="Fotografia anterior">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
                '<button class="carrossel__seta carrossel__seta--seg" type="button" data-passo="1" aria-label="Fotografia seguinte">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' +
                '<div class="carrossel__pontos">' + pontos + '</div>'
              : '') +
            '</div>';
        }

        var listaDet = (s.inclui || []).length
          ? '<ul class="folha__inclui">' + s.inclui.map(function (x) {
              return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
          : '';
        var tempo = s.tempo ? '<p class="folha__tempo">Tempo médio: ' + esc(s.tempo) + '</p>' : '';
        var texto = s.detalhe ? '<p class="folha__texto">' + esc(s.detalhe) + '</p>' : '';

        /* O painel fica FORA da .placa de propósito: qualquer overflow, filtro
           ou opacidade dentro da subárvore com preserve-3d achata o 3D — foi o
           que já aconteceu no iPhone com o mix-blend-mode. */
        var painel =
          '<details class="ficha__det" id="detalhe-' + esc(s.id) + '">' +
          '<summary>Ver detalhe — ' + esc(s.titulo) + '</summary>' +
          '<div class="ficha__det-corpo">' +
          '<h4 class="folha__tit" tabindex="-1">' + esc(s.titulo) + '</h4>' +
          '<p class="folha__desc">' + esc(s.descricao) + '</p>' + texto + tempo + listaDet +
          carrossel + '</div></details>';

        return '<article class="ficha" id="servico-' + esc(s.id) + '">' + alias +
          '<div class="placa">' + zonas +
          '<div class="camadas">' +
          (capa ? '<img src="' + esc(src) + '"' +
            (ss ? ' srcset="' + esc(ss) + '" sizes="(max-width:1000px) 46vw, 260px"' : '') +
            ' alt="' + esc(s.legenda_foto || s.titulo) + '" loading="lazy"' + attrsDim(src) + ' />' : '') +
          '<span class="moldura"></span><span class="brilho"></span>' +
          '<span class="selo">' + ('0' + (i + 1)).slice(-2) + '</span>' +
          /* Face do cartão: só o título e o convite. A descrição e o que
             inclui vivem no painel — repetir aqui era ler duas vezes o mesmo. */
          '<div class="ficha__corpo"><span class="risca"></span>' +
          '<h3><a class="ficha__abrir" href="#detalhe-' + esc(s.id) + '">' + esc(s.titulo) + '</a></h3>' +
          '<span class="ficha__mais" aria-hidden="true">Ver detalhe</span>' +
          '</div></div></div>' + painel + '</article>';
      }).join('');


      revelar(svcGrid);
      ligarFolha(svcGrid);
    }).catch(function () { });
  }

  /* ========================================== FOLHA DE DETALHE DOS SERVIÇOS

     Um <dialog> partilhado: folha que sobe de baixo no telemóvel, caixa
     centrada no computador. O conteúdo é MOVIDO do <details> para cá e
     devolvido ao fechar — copiar duplicaria o texto para o motor de busca.

     Porquê <details> como origem e não um <dialog> por serviço: um <dialog>
     fechado é display:none, sai da árvore de acessibilidade e o Ctrl+F do
     browser não o encontra. Um <details> fechado é encontrável, o browser
     abre-o sozinho na pesquisa, e sem JavaScript o site continua inteiro. */
  var folha = el('folha');
  var folhaCorpo = el('folha-corpo');
  var folhaOrigem = null;      /* o <details> de onde veio o conteúdo */
  var folhaGatilho = null;     /* para devolver o foco a quem abriu */
  var fecharPorHistorico = false;
  var fundoNoBackdrop = false;
  var btFolhaX = el('folha-fechar');

  function podeFolha() {
    return !!(folha && folhaCorpo && typeof folha.showModal === 'function');
  }

  function abrirFolha(det, gatilho) {
    if (!podeFolha() || folha.open) return false;
    var corpo = det.querySelector('.ficha__det-corpo');
    if (!corpo) return false;
    /* dois modais ao mesmo tempo, com lógicas de inert diferentes, desorientam */
    fecharMenu();
    folhaOrigem = det;
    folhaGatilho = gatilho || null;
    folhaCorpo.appendChild(corpo);
    ligarCarrossel(corpo);
    var t = corpo.querySelector('.folha__tit');
    folha.setAttribute('aria-label', t ? t.textContent : 'Detalhe do serviço');
    doc.documentElement.classList.add('folha-aberta');
    folha.showModal();
    /* O showModal() foca o primeiro focável, que é o X — o leitor de ecrã diria
       "Fechar" em vez do nome do serviço. Passa-se o foco para o título.
       Dois frames porque o Safari mexe no foco depois do primeiro; e um
       setTimeout por cima porque com o separador em segundo plano o
       requestAnimationFrame não chega a correr. */
    var focarTitulo = function () {
      if (!t || !folha.open) return;
      if (folhaCorpo.contains(doc.activeElement) && doc.activeElement !== btFolhaX) return;
      try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
    };
    requestAnimationFrame(function () { requestAnimationFrame(focarTitulo); });
    setTimeout(focarTitulo, 60);
    try { history.pushState({ folha: det.id }, ''); } catch (e) { }
    return true;
  }

  /* Devolve o conteúdo ao <details> de origem. Tem de poder ser chamada duas
     vezes sem estragar nada: há caminhos de fecho que se sobrepõem. */
  function restaurarFolha() {
    var corpo = folhaCorpo.firstElementChild;
    if (corpo && folhaOrigem) folhaOrigem.appendChild(corpo);
    doc.documentElement.classList.remove('folha-aberta');
    if (folhaOrigem) folhaOrigem.open = false;
    if (folhaGatilho) { try { folhaGatilho.focus({ preventScroll: true }); } catch (e) { } }
    folhaOrigem = null; folhaGatilho = null;
  }

  /* O fecho é explícito e não depende do evento `close` do <dialog>: medido no
     Chrome 148, chamar .close() não o dispara, e um site que só arrume o que
     mexeu nesse evento fica com o scroll travado e o conteúdo fora do sítio.
     O listener de `close` fica como rede, porque restaurarFolha() é idempotente. */
  function fecharFolha() {
    if (!podeFolha()) return;
    var tinhaHistorico = !fecharPorHistorico && history.state && history.state.folha;
    if (folha.open) folha.close();
    restaurarFolha();
    /* A entrada que se empilhou ao abrir tem de sair, senão o botão Voltar do
       telemóvel fica preso a fechar uma folha que já está fechada. */
    if (tinhaHistorico) { try { history.back(); } catch (e) { } }
    fecharPorHistorico = false;
  }

  if (podeFolha()) {
    folha.addEventListener('close', restaurarFolha);

    /* ESC: o browser dispara `cancel` antes de fechar. Trava-se aí para o fecho
       passar pelo mesmo caminho de todos os outros. */
    folha.addEventListener('cancel', function (e) { e.preventDefault(); fecharFolha(); });

    window.addEventListener('popstate', function () {
      if (folha.open) { fecharPorHistorico = true; fecharFolha(); }
    });

    if (btFolhaX) btFolhaX.addEventListener('click', fecharFolha);

    /* Clicar fora fecha. Compara-se também o pointerdown para um arrasto que
       comece dentro e acabe no fundo não fechar sem querer. */
    folha.addEventListener('pointerdown', function (e) { fundoNoBackdrop = (e.target === folha); });
    folha.addEventListener('click', function (e) {
      if (e.target === folha && fundoNoBackdrop) fecharFolha();
    });

    /* ---------------------------------------- ARRASTAR PARA BAIXO A FECHAR

       No telemóvel a folha sobe de baixo, e num telemóvel o que se faz a uma
       folha que subiu de baixo é empurrá-la para baixo outra vez. O X continua
       lá para quem não conhece o gesto e para quem usa teclado.

       Onde se pode agarrar: na faixa do topo sempre, e em qualquer ponto do
       conteúdo desde que ele já esteja no início — senão o gesto de rolar para
       cima dentro do painel fechava a folha sem querer. */
    var caixa = folha.querySelector('.folha__caixa');
    var soTelemovel = window.matchMedia('(max-width: 47.999rem)');
    var arr = null;

    function podeArrastar(e) {
      if (!soTelemovel.matches || e.button) return false;
      if (e.target.closest('.folha__pega')) return true;
      /* dentro dos controlos do carrossel o gesto é horizontal, não é nosso */
      if (e.target.closest('.carrossel__pista, .folha__x, a, button')) return false;
      return folhaCorpo.scrollTop <= 0;
    }

    caixa.addEventListener('pointerdown', function (e) {
      if (!podeArrastar(e)) return;
      arr = { y0: e.clientY, dy: 0, id: e.pointerId, activo: false,
              ultimoY: e.clientY, ultimoT: Date.now(), vel: 0 };
    });

    caixa.addEventListener('pointermove', function (e) {
      if (!arr || e.pointerId !== arr.id) return;
      var dy = e.clientY - arr.y0;
      /* Só se assume o gesto depois de 6px para baixo: abaixo disso ainda pode
         ser um toque, e roubar o evento faria os links deixarem de funcionar. */
      if (!arr.activo) {
        if (dy < 6) { if (dy < -6) arr = null; return; }
        arr.activo = true;
        folha.classList.add('a-arrastar');
        try { caixa.setPointerCapture(arr.id); } catch (er) { }
      }
      /* Velocidade medida no último trecho, não desde o início do gesto: um
         arrasto lento que acaba num piparote tem de fechar, e a média desde o
         princípio esconderia exactamente isso. */
      var agora = Date.now(), dt = agora - arr.ultimoT;
      if (dt > 0) {
        var v = (e.clientY - arr.ultimoY) / dt;
        arr.vel = arr.vel ? arr.vel * 0.4 + v * 0.6 : v;   /* suaviza o ruído do dedo */
        arr.ultimoY = e.clientY; arr.ultimoT = agora;
      }
      arr.dy = Math.max(0, dy);
      folha.style.translate = '0 ' + arr.dy + 'px';
      /* o fundo clareia à medida que a folha sai, para o gesto ter resposta */
      folha.style.setProperty('--fundo-op', String(Math.max(0, 1 - arr.dy / 420)));
      e.preventDefault();
    });

    function largar(e) {
      if (!arr || (e && e.pointerId !== arr.id)) return;
      var d = arr.dy, vel = arr.vel, activo = arr.activo, parado = Date.now() - arr.ultimoT;
      arr = null;
      folha.classList.remove('a-arrastar');
      folha.style.translate = '';
      folha.style.removeProperty('--fundo-op');
      if (!activo) return;
      /* Fecha se foi longe, ou se foi curto mas ainda em movimento — um
         piparote conta. Se o dedo ficou parado mais de 120ms antes de largar,
         já não é piparote nenhum e só a distância decide. */
      var altura = caixa.getBoundingClientRect().height || 1;
      var piparote = parado < 120 && vel > 0.35 && d > 30;
      if (d > Math.min(120, altura * 0.28) || piparote) fecharFolha();
    }
    caixa.addEventListener('pointerup', largar);
    caixa.addEventListener('pointercancel', largar);
  }

  /* --------------------------------------------------------- CARROSSEL
     A pista já rola sozinha (scroll-snap + overflow-x). Isto é só o atalho:
     setas, pontos, e manter os dois em sincronia com o que o dedo fez. */
  function ligarCarrossel(raiz) {
    var car = raiz.querySelector('[data-carrossel]');
    if (!car || car.dataset.ligado) return;
    car.dataset.ligado = '1';
    var pista = car.querySelector('.carrossel__pista');
    var fotos = [].slice.call(pista.children);
    var pontos = [].slice.call(car.querySelectorAll('.carrossel__ponto'));
    var setas = [].slice.call(car.querySelectorAll('.carrossel__seta'));
    if (fotos.length < 2) return;

    var suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function actual() {
      var meio = pista.scrollLeft + pista.clientWidth / 2;
      var melhor = 0, dist = Infinity;
      fotos.forEach(function (f, i) {
        var c = f.offsetLeft + f.offsetWidth / 2;
        var d = Math.abs(c - meio);
        if (d < dist) { dist = d; melhor = i; }
      });
      return melhor;
    }
    function irPara(i) {
      i = Math.max(0, Math.min(fotos.length - 1, i));
      pista.scrollTo({ left: fotos[i].offsetLeft, behavior: suave ? 'smooth' : 'auto' });
    }
    function sincronizar() {
      var i = actual();
      pontos.forEach(function (p, k) {
        if (k === i) p.setAttribute('aria-current', 'true');
        else p.removeAttribute('aria-current');
      });
      setas.forEach(function (b) {
        var passo = +b.dataset.passo;
        b.disabled = (passo < 0 && i === 0) || (passo > 0 && i === fotos.length - 1);
      });
    }
    setas.forEach(function (b) {
      b.addEventListener('click', function () { irPara(actual() + (+b.dataset.passo)); });
    });
    pontos.forEach(function (p) {
      p.addEventListener('click', function () { irPara(+p.dataset.ir); });
    });
    var pendente;
    pista.addEventListener('scroll', function () {
      clearTimeout(pendente); pendente = setTimeout(sincronizar, 70);
    }, { passive: true });
    sincronizar();
  }

  function ligarFolha(grelha) {
    /* Sem <dialog> (browser muito antigo) os <details> voltam a aparecer e
       abrem no lugar — o serviço nunca fica inacessível. */
    if (!podeFolha()) { doc.documentElement.classList.add('sem-folha'); return; }
    doc.documentElement.classList.add('tem-folha');
    /* Delegado: no computador as 9 zonas de rato ficam por cima do cartão, e o
       clique nelas borbulha na mesma até aqui. */
    grelha.addEventListener('click', function (e) {
      var ficha = e.target.closest ? e.target.closest('.ficha') : null;
      if (!ficha) return;
      var det = ficha.querySelector('.ficha__det');
      if (!det) return;
      e.preventDefault();
      abrirFolha(det, ficha.querySelector('.ficha__abrir'));
    });
    /* Teclado: o <a> do título dispara o clique acima, mas o <summary> do
       fallback também tem de levar à folha em vez de abrir no lugar. */
    grelha.querySelectorAll('.ficha__det > summary').forEach(function (sum) {
      sum.addEventListener('click', function (e) {
        e.preventDefault();
        abrirFolha(sum.parentElement, sum);
      });
    });
  }

  /* ================================================== LAVAGEM E ESTÉTICA */
  var lavagensLista = el('lavagens-lista');
  if (lavagensLista) {
    Promise.all([getJSON('data/lavagens.json'), dimsProntas]).then(function (r) {
      var d = r[0];
      var itens = ((d && d.itens) || []).filter(function (p) { return p && p.nome; });
      var seccao = el('lavagens');

      aplicarHead(seccao, d.head);

      /* Sem serviços na lista, a secção mostra um estado honesto em vez de um vazio.
         Antes eu removia a secção inteira — mas o pré-render escreve o resultado
         de volta no index.html, e isso apagava a secção do ficheiro de origem:
         no dia em que o cliente acrescentasse o primeiro serviço, já não havia
         secção para voltar. Um convite a telefonar também converte melhor do que
         um buraco. */
      if (!itens.length) {
        var filtrosVazio = el('lavagens-filtros');
        if (filtrosVazio) filtrosVazio.innerHTML = '';
        lavagensLista.innerHTML =
          '<div class="lavagens__vazio">' +
          '<p><strong>Ainda não temos a tabela publicada aqui.</strong></p>' +
          '<p>Fazemos lavagem por dentro e por fora, higienização do ar condicionado, ' +
          'estofos e cera. Diga-nos o que precisa e o carro que tem, e dizemos-lhe ' +
          'quanto custa e quanto tempo demora.</p>' +
          '<a class="lavagem__btn" href="https://wa.me/' + (TELEFONE_INTL || '351922022364') +
          '?text=' + encodeURIComponent('Olá! Queria marcar uma lavagem. ') +
          '" target="_blank" rel="noopener">Pedir orçamento</a>' +
          '</div>';
        return;
      }

      var cats = [];
      itens.forEach(function (p) {
        if (p.categoria && cats.indexOf(p.categoria) === -1) cats.push(p.categoria);
      });

      /* Categoria -> nome do ficheiro da ilustração. Sem acentos nem espaços,
         e sem depender de o cliente escrever a categoria sempre igual. */
      function slugCat(c) {
        var t = String(c || '').toLowerCase()
          .replace(/[áàâã]/g, 'a').replace(/[éê]/g, 'e').replace(/í/g, 'i')
          .replace(/[óôõ]/g, 'o').replace(/[úü]/g, 'u').replace(/ç/g, 'c');
        if (t.indexOf('lava') === 0) return 'lavagens';
        if (t.indexOf('interior') === 0) return 'interior';
        if (t.indexOf('trat') === 0) return 'tratamentos';
        return 'lavagens';
      }

      function linha(p) {
        /* A fotografia do cliente vem do backoffice como caminho completo; passa
           pelo mesmo resolvedor dos serviços, para servir a variante do tamanho
           certo em vez do original de 4000px que saiu do telemóvel. */
        var f = p.foto ? resolverFoto(p.foto, 'lavagens', 128) : null;
        if (!f) {
          /* Sem fotografia, a ilustração da categoria. É um DESENHO e não uma
             fotografia de propósito: uma foto genérica daria a entender que
             aquele serviço em concreto dá aquele resultado. */
          var base = 'assets/img/lavagens/cat-' + slugCat(p.categoria);
          if (DIMS[base + '-128.webp']) {
            f = { src: base + '-128.webp',
                  srcset: base + '-128.webp 128w, ' + base + '-192.webp 192w' };
          }
        }
        var fig = f
          ? '<div class="lavagem__fig"><img src="' + esc(f.src) + '"' +
            (f.srcset ? ' srcset="' + esc(f.srcset) + '" sizes="64px"' : '') +
            ' alt="" loading="lazy" decoding="async"' + attrsDim(f.src) + ' /></div>'
          : '<div class="lavagem__fig lavagem__fig--vazia" aria-hidden="true">' + ICONE_PECA + '</div>';
        /* O que o serviço inclui é o que faz alguém escolher entre a lavagem de
           20 € e a de 30 €. Vai a seguir ao nome, e a duração à frente do preço
           — quem marca uma lavagem quer saber quanto tempo fica sem o carro. */
        var meta = [];
        if (p.inclui) meta.push(esc(p.inclui));
        var preco = p.preco
          ? '<span class="lavagem__preco">' + esc(p.preco) +
            '<small>' + (p.duracao ? esc(p.duracao) + ' · ' : '') + 'IVA incluído</small></span>'
          : '<span class="lavagem__preco">Sob consulta</span>';
        /* A mensagem já leva o serviço escrito: quem recebe sabe logo do que se
           trata, e quem envia não tem de o explicar. */
        var msg = encodeURIComponent('Olá! Queria marcar: ' + p.nome +
                  (p.preco ? ' (' + p.preco + ')' : ''));
        /* o número vem do backoffice, não escrito à mão — senão mudá-lo em
           Contactos deixava estes botões todos no número antigo */
        var wa = 'https://wa.me/' + (TELEFONE_INTL || '351922022364');
        return '<li class="lavagem" data-cat="' + esc(p.categoria || '') + '">' + fig +
          '<div><div class="lavagem__nome">' + esc(p.nome) + '</div>' +
          (meta.length ? '<div class="lavagem__meta">' + meta.join(' · ') + '</div>' : '') +
          '</div><div class="lavagem__dir">' + preco +
          /* O texto visível é só «Marcar» para não encher a linha, mas o nome
             acessível leva o serviço: onze ligações iguais no rotor do
             VoiceOver não se distinguem umas das outras. */
          '<a class="lavagem__btn" href="' + wa + '?text=' + msg +
          '" target="_blank" rel="noopener" aria-label="Marcar: ' + esc(p.nome) +
          '">Marcar</a></div></li>';
      }

      /* <ul>/<li> e não doze <div>: sem isso o leitor de ecrã não anuncia
         «lista com 12 itens» nem permite saltar de item em item. */
      lavagensLista.innerHTML = '<ul class="lavagens__ul">' + itens.map(linha).join('') + '</ul>';

      /* ------------------------------------------------- VER MAIS / VER MENOS

         Mostra os primeiros LIMITE serviços e esconde o resto atrás de um botão.
         O estado escondido é aplicado AQUI, em runtime, e o botão vive fora dos
         marcadores de pré-render: sem JavaScript a lista aparece inteira, que é
         o que interessa para quem lê sem ele e para o motor de busca. */
      var LIMITE = 5;
      var caixaMais = el('lavagens-mais');
      var aviso = el('lavagens-aviso');   /* lido pelo aplicar(), declarado antes dele */
      var filtroActual = '';
      var expandido = false;

      /* No estado inicial — sem filtro e por expandir — quem esconde os serviços a
         partir da sexta é o CSS, por :nth-child. Assim já vêm escondidas da
         primeira pintura e a lista não salta quando o JavaScript arranca. A
         partir da primeira interacção o JavaScript assume: põe a classe
         --js no <ul>, que desliga a regra do CSS, e passa a usar `hidden`
         serviço a serviço — que é o que o filtro obriga, porque aí as visíveis já
         não são as primeiras cinco. */
      var ul = lavagensLista.querySelector('.lavagens__ul');

      function aplicar(anunciar, interagiu) {
        var todas = [].slice.call(lavagensLista.querySelectorAll('.lavagem'));
        var naCategoria = todas.filter(function (l) {
          return !filtroActual || l.getAttribute('data-cat') === filtroActual;
        });
        var mostradas = expandido ? naCategoria.length : Math.min(LIMITE, naCategoria.length);
        if (interagiu && ul) {
          ul.classList.add('lavagens__ul--js');
          todas.forEach(function (l) {
            var i = naCategoria.indexOf(l);
            /* hidden e não display:none — sai da árvore de acessibilidade e do
               Ctrl+F do browser da mesma maneira, mas diz-se sozinho no HTML */
            l.hidden = (i === -1 || i >= mostradas);
          });
        }

        var escondidas = naCategoria.length - mostradas;
        if (!caixaMais) return;
        if (naCategoria.length <= LIMITE) {
          caixaMais.innerHTML = '';
        } else {
          caixaMais.innerHTML =
            '<button class="btn btn--fantasma lavagens__btn-mais" type="button" ' +
            'aria-expanded="' + (expandido ? 'true' : 'false') + '" ' +
            'aria-controls="lavagens-lista">' +
            (expandido ? 'Ver menos' : 'Ver mais ' + escondidas +
              (escondidas === 1 ? ' serviço' : ' serviços')) +
            '</button>';
        }
        if (anunciar && aviso) {
          aviso.textContent = naCategoria.length +
            (naCategoria.length === 1 ? ' serviço' : ' serviços') +
            (filtroActual ? ' em ' + filtroActual : '') +
            (escondidas > 0 ? ', ' + mostradas + ' à vista' : '');
        }
      }

      if (caixaMais) {
        caixaMais.addEventListener('click', function (e) {
          var b = e.target.closest('.lavagens__btn-mais');
          if (!b) return;
          var aRecolher = expandido;
          expandido = !expandido;
          aplicar(true, true);
          if (aRecolher) {
            /* ao recolher, a lista encurta debaixo dos pés: se o topo já ficou
               acima do ecrã, o visitante ficava a olhar para outra secção */
            var topo = lavagensLista.getBoundingClientRect().top;
            if (topo < 0) lavagensLista.scrollIntoView({ block: 'start', behavior: 'smooth' });
            var bt = caixaMais.querySelector('.lavagens__btn-mais');
            if (bt) bt.focus({ preventScroll: true });
          } else {
            /* ao expandir, o foco vai para o primeiro serviço que acabou de surgir */
            var novas = lavagensLista.querySelectorAll('.lavagem:not([hidden]) .lavagem__btn');
            var alvo = novas[Math.min(LIMITE, novas.length - 1)];
            if (alvo) alvo.focus({ preventScroll: true });
          }
        });
      }

      aplicar(false, false);

      /* filtros só a partir de 9 serviços: com 4 são ruído */
      var caixaFiltros = el('lavagens-filtros');
      if (caixaFiltros) {
        if (itens.length < 9 || cats.length < 2) {
          caixaFiltros.remove();
        } else {
          /* aria-pressed e não só a classe: o filtro activo distinguia-se apenas
             pelo fundo, e um leitor de ecrã não tem como saber qual está ligado
             — a lista encolhe sem explicação. */
          caixaFiltros.setAttribute('role', 'group');
          caixaFiltros.setAttribute('aria-label', 'Filtrar serviços por categoria');
          caixaFiltros.innerHTML =
            '<button class="filtro is-on" type="button" aria-pressed="true" data-f="">Todas ' +
            '<span class="mono">' + itens.length + '</span><span class="visually-hidden"> serviços</span></button>' +
            cats.map(function (c) {
              var n = itens.filter(function (p) { return p.categoria === c; }).length;
              return '<button class="filtro" type="button" aria-pressed="false" data-f="' + esc(c) + '">' +
                     esc(c) + ' <span class="mono">' + n + '</span>' +
                     '<span class="visually-hidden"> serviços</span></button>';
            }).join('');
          caixaFiltros.addEventListener('click', function (e) {
            var b = e.target.closest('.filtro');
            if (!b) return;
            caixaFiltros.querySelectorAll('.filtro').forEach(function (x) {
              x.classList.remove('is-on');
              x.setAttribute('aria-pressed', 'false');
            });
            b.classList.add('is-on');
            b.setAttribute('aria-pressed', 'true');
            filtroActual = b.getAttribute('data-f');
            /* mudar de categoria recolhe a lista: senão bastava expandir uma vez
               para todas as categorias seguintes abrirem já esticadas */
            expandido = false;
            aplicar(true, true);
          });
        }
      }
    }).catch(function () { });
  }

  var ICONE_PECA = '<svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5' +
    'M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/></svg>';

  /* ------------------------------------------------------------ auxiliares */
  function aplicarHead(escopo, head) {
    if (!escopo || !head) return;
    if (head.etiqueta) { var e = escopo.querySelector('.etiqueta'); if (e) e.textContent = head.etiqueta; }
    if (head.titulo) { var t = escopo.querySelector('.h-sec'); if (t) t.textContent = head.titulo; }
    if (head.lead) { var l = escopo.querySelector('.lead'); if (l) l.textContent = head.lead; }
  }

  /* ano do rodapé */
  doc.querySelectorAll('[data-ano]').forEach(function (n) {
    n.textContent = new Date().getFullYear();
  });

  revelar();
})();
