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
        var p = menu.querySelector('a');
        if (p) p.focus({ preventScroll: true });
      }
    });

    /* prender o foco: Tab no último volta ao primeiro, Shift+Tab no primeiro
       vai para o último. O botão de fechar entra no ciclo. */
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !doc.body.classList.contains('menu-aberto')) return;
      var itens = [toggle].concat([].slice.call(menu.querySelectorAll(FOCAVEIS)))
        .filter(function (n) { return n.offsetParent !== null || n === toggle; });
      if (!itens.length) return;
      var primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && doc.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && doc.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      else if (itens.indexOf(doc.activeElement) === -1) { e.preventDefault(); primeiro.focus(); }
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) fecharMenu();
    });
    /* tocar no logótipo com o menu aberto tem de o fechar — antes ficava por
       cima do painel e o clique não fazia nada de visível */
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
    var io = new IntersectionObserver(function (ens) {
      ens.forEach(function (e) {
        var a = links[e.target.id];
        if (a && e.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove('is-actual'); });
          a.classList.add('is-actual');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    alvos.forEach(function (s) { io.observe(s); });
  }

  /* ============================================ CONTEÚDO EDITÁVEL (site) */
  getJSON('data/site.json').then(function (site) {
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
    montarMapa(c);
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

  /* --------------------------------------------- mapa carregado por clique */
  /* Nada é pedido ao Google antes de o visitante decidir. Sem pedido não há
     cookie, e sem cookie não é preciso banner de consentimento. */
  function montarMapa(c) {
    var caixa = el('mapa');
    if (!caixa) return;
    var botao = caixa.querySelector('.mapa__facade');
    if (!botao) return;
    var morada = [c.morada_linha1, c.morada_linha2].filter(Boolean).join(', ');
    botao.addEventListener('click', function () {
      var url = 'https://maps.google.com/maps?q=' + encodeURIComponent(morada || 'PokeAuto São João da Madeira') +
                '&z=16&hl=pt&output=embed';
      var ifr = doc.createElement('iframe');
      ifr.src = url;
      ifr.title = 'Mapa da localização da PokeAuto na Rua da Liberdade, São João da Madeira';
      ifr.loading = 'lazy';
      ifr.referrerPolicy = 'no-referrer-when-downgrade';
      caixa.innerHTML = '';
      caixa.appendChild(ifr);
    });
  }

  /* ================================================================ SERVIÇOS */
  var svcGrid = el('servicos-lista');
  if (svcGrid) {
    Promise.all([getJSON('data/servicos.json'), dimsProntas]).then(function (r) {
      var d = r[0];
      aplicarHead(el('servicos'), d.head);
      var itens = (d && d.itens) || [];

      svcGrid.innerHTML = itens.map(function (s, i) {
        var base = 'assets/img/trabalhos/' + (s.foto || '');
        var src = base + '-840.webp';
        var ss = s.foto ? [320, 480, 640, 840].map(function (w) {
          var f = base + '-' + w + '.webp';
          return DIMS[f] ? f + ' ' + w + 'w' : null;
        }).filter(Boolean).join(', ') : '';
        var inclui = (s.inclui || []).length
          ? '<ul class="ficha__inclui">' + s.inclui.map(function (x) {
              return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
          : '';
        /* âncoras antigas: os serviços que foram agrupados mantêm o id, senão
           um link que já ande por aí deixa de ir a lado nenhum */
        var alias = (s.alias || []).map(function (a) {
          return '<span id="servico-' + esc(a) + '"></span>'; }).join('');
        /* as 9 zonas de rato; em telemóvel nunca correm (hover:hover) */
        var zonas = new Array(9).join('<i></i>') + '<i></i>';
        return '<article class="ficha" id="servico-' + esc(s.id) + '">' + alias +
          '<div class="placa">' + zonas +
          '<div class="camadas">' +
          (s.foto ? '<img src="' + esc(src) + '"' +
            (ss ? ' srcset="' + esc(ss) + '" sizes="(max-width:1000px) 46vw, 260px"' : '') +
            ' alt="' + esc(s.legenda_foto || s.titulo) + '" loading="lazy"' + attrsDim(src) + ' />' : '') +
          '<span class="moldura"></span><span class="brilho"></span>' +
          '<span class="selo">' + ('0' + (i + 1)).slice(-2) + '</span>' +
          '<div class="ficha__corpo"><span class="risca"></span>' +
          '<h3>' + esc(s.titulo) + '</h3>' +
          '<p>' + esc(s.descricao) + '</p>' + inclui +
          '</div></div></div></article>';
      }).join('');

      /* lista de serviços do rodapé: gerada, não escrita à mão — senão ficava
         com links mortos assim que o cliente mudasse um identificador */
      var rod = el('rodape-servicos');
      if (rod) {
        rod.innerHTML = itens.slice(0, 6).map(function (s) {
          return '<li><a href="#servico-' + esc(s.id) + '">' + esc(s.titulo) + '</a></li>';
        }).join('');
      }

      revelar(svcGrid);
    }).catch(function () { });
  }

  /* ==================================================================== FAQ */
  var faq = el('faq-lista');
  if (faq) {
    getJSON('data/faq.json').then(function (d) {
      aplicarHead(el('faq'), d.head);
      faq.innerHTML = ((d && d.itens) || []).map(function (x) {
        return '<details><summary>' + esc(x.q) + '</summary><p>' + esc(x.a) + '</p></details>';
      }).join('');
    }).catch(function () { });
  }

  /* ======================================================= BALCÃO DE PEÇAS */
  var pecasLista = el('pecas-lista');
  if (pecasLista) {
    Promise.all([getJSON('data/pecas.json'), dimsProntas]).then(function (r) {
      var d = r[0];
      var itens = ((d && d.itens) || []).filter(function (p) { return p && p.nome; });
      var seccao = el('pecas');

      aplicarHead(seccao, d.head);

      /* Sem peças na lista, a secção mostra um estado honesto em vez de um vazio.
         Antes eu removia a secção inteira — mas o pré-render escreve o resultado
         de volta no index.html, e isso apagava a secção do ficheiro de origem:
         no dia em que o cliente acrescentasse a primeira peça, já não havia
         secção para voltar. Um convite a telefonar também converte melhor do que
         um buraco. */
      if (!itens.length) {
        var filtrosVazio = el('pecas-filtros');
        if (filtrosVazio) filtrosVazio.innerHTML = '';
        pecasLista.innerHTML =
          '<div class="pecas__vazio">' +
          '<p><strong>Ainda não temos a lista publicada aqui.</strong></p>' +
          '<p>Temos peças em stock na oficina e trabalhamos com fornecedores para o ' +
          'que não houver. Diga-nos de que peça precisa e dizemos-lhe se temos e ' +
          'quanto custa.</p>' +
          '<a class="peca__btn" href="https://wa.me/' + (TELEFONE_INTL || '351922022364') +
          '?text=' + encodeURIComponent('Olá! Queria saber se têm uma peça disponível: ') +
          '" target="_blank" rel="noopener">Perguntar por uma peça</a>' +
          '</div>';
        return;
      }

      var cats = [];
      itens.forEach(function (p) {
        if (p.categoria && cats.indexOf(p.categoria) === -1) cats.push(p.categoria);
      });

      function linha(p) {
        var fig = p.foto
          ? '<div class="peca__fig"><img src="' + esc(String(p.foto).replace(/^\/+/, '')) +
            '" alt="' + esc(p.nome) + '" loading="lazy" /></div>'
          : '<div class="peca__fig peca__fig--vazia" aria-hidden="true">' + ICONE_PECA + '</div>';
        var meta = [];
        if (p.compatibilidade) meta.push(esc(p.compatibilidade));
        if (p.estado === 'usada') meta.push('Usada');
        var preco = p.preco
          ? '<span class="peca__preco">' + esc(p.preco) + '<small>IVA incluído</small></span>'
          : '<span class="peca__preco">Sob consulta</span>';
        var msg = encodeURIComponent('Olá! Tenho interesse nesta peça: ' + p.nome +
                  (p.referencia ? ' (ref. ' + p.referencia + ')' : ''));
        /* o número vem do backoffice, não escrito à mão — senão mudá-lo em
           Contactos deixava estes botões todos no número antigo */
        var wa = 'https://wa.me/' + (TELEFONE_INTL || '351922022364');
        return '<div class="peca" data-cat="' + esc(p.categoria || '') + '">' + fig +
          '<div><div class="peca__nome">' + esc(p.nome) + '</div>' +
          (p.referencia ? '<div class="peca__ref">Ref. ' + esc(p.referencia) + '</div>' : '') +
          (meta.length ? '<div class="peca__meta">' + meta.join(' · ') + '</div>' : '') +
          '</div><div class="peca__dir">' + preco +
          '<a class="peca__btn" href="' + wa + '?text=' + msg +
          '" target="_blank" rel="noopener">Perguntar</a></div></div>';
      }

      pecasLista.innerHTML = itens.map(linha).join('');

      /* filtros só a partir de 9 peças: com 4 são ruído */
      var caixaFiltros = el('pecas-filtros');
      if (caixaFiltros) {
        if (itens.length < 9 || cats.length < 2) {
          caixaFiltros.remove();
        } else {
          caixaFiltros.innerHTML = '<button class="filtro is-on" data-f="">Todas ' +
            '<span class="mono">' + itens.length + '</span></button>' +
            cats.map(function (c) {
              var n = itens.filter(function (p) { return p.categoria === c; }).length;
              return '<button class="filtro" data-f="' + esc(c) + '">' + esc(c) +
                     ' <span class="mono">' + n + '</span></button>';
            }).join('');
          caixaFiltros.addEventListener('click', function (e) {
            var b = e.target.closest('.filtro');
            if (!b) return;
            caixaFiltros.querySelectorAll('.filtro').forEach(function (x) { x.classList.remove('is-on'); });
            b.classList.add('is-on');
            var f = b.getAttribute('data-f');
            pecasLista.querySelectorAll('.peca').forEach(function (l) {
              l.style.display = (!f || l.getAttribute('data-cat') === f) ? '' : 'none';
            });
          });
        }
      }
    }).catch(function () { });
  }

  var ICONE_PECA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
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
