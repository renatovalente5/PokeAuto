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
  function getJSON(url) {
    return fetch(url, { cache: 'default' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function el(id) { return doc.getElementById(id); }

  /* Dimensões reais das imagens, geradas no build por dimensoes.py. Sem
     width/height o browser não reserva espaço, as fotos colapsam todas dentro
     do primeiro ecrã e o loading="lazy" deixa de adiar seja o que for. */
  var DIMS = {};
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

  function fecharMenu() {
    doc.body.classList.remove('menu-aberto');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var aberto = doc.body.classList.toggle('menu-aberto');
      toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      if (aberto) {
        var p = menu.querySelector('a');
        if (p) p.focus({ preventScroll: true });
      }
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) fecharMenu();
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

    function val(caminho) {
      return caminho.split('.').reduce(function (o, k) { return o && o[k]; }, site);
    }
    doc.querySelectorAll('[data-site]').forEach(function (n) {
      var v = val(n.getAttribute('data-site'));
      if (v != null && v !== '') n.textContent = v;
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
    var fb = doc.querySelectorAll('[data-fb]');
    fb.forEach(function (a) {
      if (c.facebook_url) a.setAttribute('href', c.facebook_url);
      else a.remove();
    });

    /* horário: só aparece se estiver preenchido. Um horário errado é pior do
       que horário nenhum — manda gente à porta fechada. */
    var hor = el('horario-lista');
    if (hor) {
      var DIAS = { Monday: 'Segunda', Tuesday: 'Terça', Wednesday: 'Quarta',
                   Thursday: 'Quinta', Friday: 'Sexta', Saturday: 'Sábado', Sunday: 'Domingo' };
      var blocos = (site.horario || []).filter(function (b) {
        return b && b.dias && b.dias.length && b.abre && b.fecha;
      });
      if (!blocos.length) {
        var caixa = hor.closest('.contacto-item');
        if (caixa) caixa.remove();
      } else {
        hor.innerHTML = blocos.map(function (b) {
          var ds = (typeof b.dias === 'string' ? [b.dias] : b.dias).map(function (d) { return DIAS[d] || d; });
          var rot = ds.length > 2 ? ds[0] + ' a ' + ds[ds.length - 1] : ds.join(' e ');
          return '<li><span>' + esc(rot) + '</span> <span class="mono">' +
                 esc(b.abre) + '–' + esc(b.fecha) + '</span></li>';
        }).join('');
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
        var foto = '';
        if (s.foto) {
          var src = 'assets/img/trabalhos/' + s.foto + '-840.webp';
          foto = '<figure class="svc__foto">' +
            '<img src="' + esc(src) + '" alt="' + esc(s.legenda_foto || s.titulo) + '"' +
            ' loading="lazy"' + attrsDim(src) + ' />' +
            (s.legenda_foto ? '<figcaption>' + esc(s.legenda_foto) + '</figcaption>' : '') +
            '</figure>';
        }
        var inclui = (s.inclui || []).length
          ? '<ul class="svc__inclui">' + s.inclui.map(function (x) {
              return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
          : '';
        var tempo = s.tempo ? '<p class="svc__tempo">Tempo médio: ' + esc(s.tempo) + '</p>' : '';
        return '<article class="svc' + (s.foto ? ' svc--foto' : '') + '" id="servico-' +
          esc(s.id) + '" data-reveal>' +
          '<div class="svc__n" aria-hidden="true">' + ('0' + (i + 1)).slice(-2) + '</div>' +
          '<div class="svc__corpo"><div>' +
          '<h3 class="h-card">' + esc(s.titulo) + '</h3>' +
          '<p>' + esc(s.descricao) + '</p>' + inclui + tempo +
          '</div>' + foto + '</div></article>';
      }).join('');

      /* chips de atalho, na faixa amarela */
      var chips = el('chips-lista');
      if (chips) {
        chips.innerHTML = itens.map(function (s) {
          return '<a class="chip" href="#servico-' + esc(s.id) + '">' + esc(s.titulo) + '</a>';
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
          '<a class="peca__btn" href="https://wa.me/351922022364?text=' +
          encodeURIComponent('Olá! Queria saber se têm uma peça disponível: ') +
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
        return '<div class="peca" data-cat="' + esc(p.categoria || '') + '">' + fig +
          '<div><div class="peca__nome">' + esc(p.nome) + '</div>' +
          (p.referencia ? '<div class="peca__ref">Ref. ' + esc(p.referencia) + '</div>' : '') +
          (meta.length ? '<div class="peca__meta">' + meta.join(' · ') + '</div>' : '') +
          '</div><div class="peca__dir">' + preco +
          '<a class="peca__btn" href="https://wa.me/351922022364?text=' + msg +
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
