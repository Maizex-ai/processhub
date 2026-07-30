// ProcessHub Markdown Preview — клиентский скрипт встроенного превью.
// Mermaid (локально) + inline pan/zoom на карточках диаграмм + модалка fullscreen.
(function () {
  'use strict';
  if (window.__phDiagZoom) return;
  window.__phDiagZoom = true;

  // Независимое листание превью без записи в settings.json IDE.
  // 1) Глушим updateView (команда «прокрути к строке курсора»).
  // 2) window.scroll/scrollTo — то, чем штатный preview двигает страницу;
  //    колесо/бар и наш scrollIntoView (TOC) эти API не используют.
  // User/workspace markdown.preview.scroll* не меняем; снятие расширения
  // возвращает штатный sync как был.
  window.addEventListener(
    'message',
    function (e) {
      var d = e && e.data;
      if (d && d.type === 'updateView') {
        e.stopImmediatePropagation();
      }
    },
    true
  );
  window.scroll = function () {};
  window.scrollTo = function () {};

  // --- Локальный рендер Mermaid ---
  var mermaidReady = false;
  function preferLightMermaid() {
    if (document.querySelector('.diag-mermaid.diag-theme-light')) return true;
    if (document.querySelector('.diag-mermaid.diag-theme-dark')) return false;
    var c = document.body.classList;
    return c.contains('vscode-light') || c.contains('vscode-high-contrast-light');
  }
  function runMermaid() {
    if (typeof mermaid === 'undefined') return;
    if (!mermaidReady) {
      mermaid.initialize(preferLightMermaid()
        ? { startOnLoad: false, theme: 'default' }
        : {
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
              darkMode: true,
              background: '#1e1e1e',
              primaryColor: '#2a2d2e',
              primaryTextColor: '#d4d4d4',
              primaryBorderColor: '#5a5d5e',
              lineColor: '#9aa4b2',
              secondaryColor: '#2a2d2e',
              tertiaryColor: '#252627'
            }
          });
      mermaidReady = true;
    }
    var nodes = document.querySelectorAll(
      '.diag-mermaid .mermaid:not([data-processed])'
    );
    if (nodes.length) {
      var done = mermaid.run({ nodes: nodes });
      if (done && typeof done.then === 'function') {
        done.catch(function () {}).then(enhanceHosts);
      } else {
        setTimeout(enhanceHosts, 80);
      }
    } else {
      enhanceHosts();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runMermaid);
  } else {
    runMermaid();
  }
  window.addEventListener('vscode.markdown.updateContent', runMermaid);

  // ---------------------------------------------------------------------------
  // Inline pan/zoom (как у markdown-mermaid / встроенного Mermaid)
  // ---------------------------------------------------------------------------

  var hostState = new WeakMap();

  function getState(host) {
    var s = hostState.get(host);
    if (!s) {
      s = { s: 1, tx: 0, ty: 0, drag: false, lx: 0, ly: 0, altOnly: false };
      hostState.set(host, s);
    }
    return s;
  }

  function applyHost(host) {
    var s = getState(host);
    var canvas = host.querySelector('.diag-canvas');
    if (!canvas) return;
    canvas.style.transform =
      'translate(' + s.tx + 'px,' + s.ty + 'px) scale(' + s.s + ')';
  }

  function zoomHost(host, factor, cx, cy) {
    var s = getState(host);
    var viewport = host.querySelector('.diag-viewport');
    if (!viewport) return;
    var prev = s.s;
    var next = Math.min(8, Math.max(0.25, prev * factor));
    if (next === prev) return;

    // Зум к точке курсора внутри viewport (если передана).
    if (typeof cx === 'number' && typeof cy === 'number') {
      var r = viewport.getBoundingClientRect();
      var px = cx - r.left - r.width / 2;
      var py = cy - r.top - r.height / 2;
      s.tx = px - ((px - s.tx) * next) / prev;
      s.ty = py - ((py - s.ty) * next) / prev;
    }
    s.s = next;
    applyHost(host);
  }

  function resetHost(host) {
    var s = getState(host);
    s.s = 1;
    s.tx = 0;
    s.ty = 0;
    applyHost(host);
  }

  function mediaOf(host) {
    return (
      host.querySelector('.diag-canvas img') ||
      host.querySelector('.diag-canvas svg') ||
      host.querySelector('img.diag-img') ||
      host.querySelector('.mermaid svg') ||
      host.querySelector('.mermaid')
    );
  }

  var enhanceTimer = null;
  var enhancing = false;

  function enhanceHosts() {
    if (enhancing) return;
    enhancing = true;
    // Обёртка диаграмм меняет высоту DOM — без фиксации scrollTop превью
    // «прыгает» к позиции курсора/синхронизации редактора.
    var scroller =
      document.scrollingElement ||
      document.documentElement ||
      document.body;
    var y = scroller ? scroller.scrollTop : 0;
    try {
      var hosts = document.querySelectorAll('.diag-host:not(.diag-error)');
      for (var i = 0; i < hosts.length; i++) {
        enhanceOne(hosts[i]);
      }
    } finally {
      if (scroller) scroller.scrollTop = y;
      enhancing = false;
    }
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhanceHosts, 200);
  }

  function enhanceOne(host) {
    if (host.getAttribute('data-ph-nav') === '1') return;
    var media =
      host.querySelector(':scope > img.diag-img') ||
      host.querySelector(':scope > .mermaid') ||
      host.querySelector('img.diag-img') ||
      host.querySelector('.mermaid');
    if (!media) return;
    // Для Mermaid ждём SVG, иначе оборачиваем пустой текст.
    if (media.classList.contains('mermaid') && !media.querySelector('svg')) {
      return;
    }

    host.setAttribute('data-ph-nav', '1');

    var expand = host.querySelector(':scope > .diag-expand');

    var viewport = document.createElement('div');
    viewport.className = 'diag-viewport';
    var canvas = document.createElement('div');
    canvas.className = 'diag-canvas';
    media.parentNode.insertBefore(viewport, media);
    canvas.appendChild(media);
    viewport.appendChild(canvas);

    var nav = document.createElement('div');
    nav.className = 'diag-nav';
    nav.innerHTML =
      '<button type="button" data-a="in" title="Приблизить">+</button>' +
      '<button type="button" data-a="out" title="Отдалить">\u2212</button>' +
      '<button type="button" data-a="reset" title="Сбросить масштаб">\u21BA</button>';
    if (expand) {
      nav.appendChild(expand);
      expand.style.opacity = '';
      expand.classList.add('diag-expand--in-nav');
    } else {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'diag-expand diag-expand--in-nav';
      btn.title = 'Раскрыть на весь экран';
      btn.innerHTML =
        "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' " +
        "stroke-linecap='round' stroke-linejoin='round'>" +
        "<path d='M8 3H5a2 2 0 0 0-2 2v3'/><path d='M21 8V5a2 2 0 0 0-2-2h-3'/>" +
        "<path d='M3 16v3a2 2 0 0 0 2 2h3'/><path d='M16 21h3a2 2 0 0 0 2-2v-3'/>" +
        '</svg>';
      nav.appendChild(btn);
    }
    host.appendChild(nav);

    nav.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !nav.contains(b)) return;
      if (b.classList.contains('diag-expand')) return; // обработает делегат модалки
      e.preventDefault();
      e.stopPropagation();
      var a = b.getAttribute('data-a');
      if (a === 'in') zoomHost(host, 1.25);
      else if (a === 'out') zoomHost(host, 0.8);
      else if (a === 'reset') resetHost(host);
    });

    viewport.addEventListener(
      'wheel',
      function (e) {
        // Колесо над диаграммой = зум (не скролл страницы).
        e.preventDefault();
        zoomHost(host, e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
      },
      { passive: false }
    );

    viewport.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.diag-nav')) return;
      var s = getState(host);
      s.drag = true;
      s.lx = e.clientX;
      s.ly = e.clientY;
      viewport.classList.add('grabbing');
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    });
    viewport.addEventListener('pointermove', function (e) {
      var s = getState(host);
      if (!s.drag) return;
      s.tx += e.clientX - s.lx;
      s.ty += e.clientY - s.ly;
      s.lx = e.clientX;
      s.ly = e.clientY;
      applyHost(host);
    });
    function endDrag(e) {
      var s = getState(host);
      if (!s.drag) return;
      s.drag = false;
      viewport.classList.remove('grabbing');
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
  }

  // ---------------------------------------------------------------------------
  // Полноэкранная модалка
  // ---------------------------------------------------------------------------

  var overlay = null, stage = null, content = null;
  // moved: был ли реальный drag (чтобы клик по пустому не путать с панорамой)
  var st = { s: 1, tx: 0, ty: 0, drag: false, moved: false, lx: 0, ly: 0, pid: null };

  function apply() {
    content.style.transform =
      'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.s + ')';
  }
  function zoomBy(f) {
    st.s = Math.min(10, Math.max(0.1, st.s * f));
    apply();
  }
  function fit() {
    st.s = 1;
    st.tx = 0;
    st.ty = 0;
    apply();
    requestAnimationFrame(function () {
      var sr = stage.getBoundingClientRect();
      var cr = content.getBoundingClientRect();
      if (cr.width && cr.height) {
        var k = Math.min(
          (sr.width - 80) / cr.width,
          (sr.height - 80) / cr.height,
          1
        );
        if (k > 0 && isFinite(k)) st.s = k;
        apply();
      }
    });
  }
  function closeModal() {
    st.drag = false;
    st.pid = null;
    stage.classList.remove('grabbing');
    overlay.classList.remove('open');
    content.innerHTML = '';
  }
  function openModal(node) {
    if (!node) return;
    if (!overlay) buildModal();
    content.innerHTML = '';
    var clone = node.cloneNode(true);
    // Как у Mermaid: без собственной подложки — читается на фоне модалки.
    clone.style.background = 'transparent';
    content.appendChild(clone);
    overlay.classList.add('open');
    st.s = 1;
    st.tx = 0;
    st.ty = 0;
    st.drag = false;
    fit();
  }
  function buildModal() {
    overlay = document.createElement('div');
    overlay.className = 'diag-modal';
    overlay.innerHTML =
      '<div class="diag-modal__stage"><div class="diag-modal__content"></div></div>' +
      '<div class="diag-modal__bar">' +
      '<button type="button" data-a="in" title="Приблизить">+</button>' +
      '<button type="button" data-a="out" title="Отдалить">\u2212</button>' +
      '<button type="button" data-a="reset" title="По размеру окна">\u21BA</button>' +
      '<button type="button" data-a="close" title="Закрыть">\u2715</button>' +
      '</div>';
    document.body.appendChild(overlay);
    stage = overlay.querySelector('.diag-modal__stage');
    content = overlay.querySelector('.diag-modal__content');
    overlay.querySelector('.diag-modal__bar').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      var a = b.getAttribute('data-a');
      if (a === 'in') zoomBy(1.25);
      else if (a === 'out') zoomBy(0.8);
      else if (a === 'reset') fit();
      else closeModal();
    });
    stage.addEventListener(
      'wheel',
      function (e) {
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
      },
      { passive: false }
    );

    // Панорама: зажал ЛКМ → двигаешь (pointer capture, как у встроенного Mermaid).
    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.diag-modal__bar')) return;
      st.drag = true;
      st.moved = false;
      st.lx = e.clientX;
      st.ly = e.clientY;
      st.pid = e.pointerId;
      stage.classList.add('grabbing');
      try {
        stage.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!st.drag || e.pointerId !== st.pid) return;
      var dx = e.clientX - st.lx;
      var dy = e.clientY - st.ly;
      if (dx || dy) st.moved = true;
      st.tx += dx;
      st.ty += dy;
      st.lx = e.clientX;
      st.ly = e.clientY;
      apply();
    });
    function endModalDrag(e) {
      if (!st.drag || (e && st.pid != null && e.pointerId !== st.pid)) return;
      st.drag = false;
      st.pid = null;
      stage.classList.remove('grabbing');
      try {
        if (e) stage.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    }
    stage.addEventListener('pointerup', endModalDrag);
    stage.addEventListener('pointercancel', endModalDrag);
    // Клик по пустому полю закрывает; после панорамы — нет.
    stage.addEventListener('click', function (e) {
      if (st.moved) {
        st.moved = false;
        return;
      }
      if (e.target === stage) closeModal();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (overlay && overlay.classList.contains('open')) {
        closeModal();
        return;
      }
      if (document.body.classList.contains('ph-toc-open')) {
        setTocOpen(false);
      }
    });
  }

  document.addEventListener(
    'click',
    function (e) {
      var b = e.target.closest ? e.target.closest('.diag-expand') : null;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      var host = b.closest('.diag-host');
      var node = host && mediaOf(host);
      if (node) openModal(node);
    },
    true
  );

  // ---------------------------------------------------------------------------
  // Sidebar — навигация по заголовкам + поиск с подсветкой в документе
  // ---------------------------------------------------------------------------

  var TOC_KEY = 'ph-sidetoc-open';
  var tocRoot = null;
  var tocList = null;
  var tocBtn = null;
  var tocSearch = null;
  var tocSearchWrap = null;
  var tocSearchClear = null;
  var tocMeta = null;
  var tocSections = [];
  var tocRefreshTimer = null;
  var tocSearchTimer = null;
  var tocQuery = '';
  var tocFocusTimer = null;
  var DOC_HIT_LIMIT = 200;
  var TOC_COLLAPSE_KEY = 'ph-sidetoc-collapsed';
  var tocCollapsed = {};

  function loadTocCollapsed() {
    try {
      var raw = sessionStorage.getItem(TOC_COLLAPSE_KEY);
      tocCollapsed = raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      tocCollapsed = {};
    }
  }

  function saveTocCollapsed() {
    try {
      sessionStorage.setItem(TOC_COLLAPSE_KEY, JSON.stringify(tocCollapsed));
    } catch (e) { /* ignore */ }
  }

  function isTocCollapsed(id) {
    return !!tocCollapsed[id];
  }

  function setTocCollapsed(id, collapsed) {
    if (collapsed) tocCollapsed[id] = 1;
    else delete tocCollapsed[id];
    saveTocCollapsed();
  }

  function tocIsOpen() {
    try {
      return sessionStorage.getItem(TOC_KEY) === '1';
    } catch (e) {
      return document.body.classList.contains('ph-toc-open');
    }
  }

  function setTocOpen(open) {
    document.body.classList.toggle('ph-toc-open', !!open);
    if (tocRoot) tocRoot.classList.toggle('open', !!open);
    if (tocBtn) {
      tocBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      tocBtn.title = open ? 'Скрыть навигацию' : 'Показать навигацию';
    }
    try {
      sessionStorage.setItem(TOC_KEY, open ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  function ensureHeadingId(h, index) {
    if (h.id) return h.id;
    var slug = (h.textContent || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\u0400-\u04ff]+/g, '-')
      .replace(/^-+|-+$/g, '');
    var id = slug || 'ph-h-' + index;
    var base = id;
    var n = 1;
    while (document.getElementById(id)) {
      id = base + '-' + n;
      n++;
    }
    h.id = id;
    return id;
  }

  function isHeadingEl(el) {
    return el && /^H[1-6]$/.test(el.tagName || '');
  }

  function collectSections() {
    var out = [];
    var nodes = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (var i = 0; i < nodes.length; i++) {
      var h = nodes[i];
      if (h.closest('.diag-modal') || h.closest('.ph-sidetoc')) continue;
      if (h.classList.contains('doc-toc-title')) continue;
      var text = (h.textContent || '').trim();
      if (!text) continue;
      var parts = [];
      var n = h.nextElementSibling;
      while (n && !isHeadingEl(n)) {
        if (
          !n.closest('.ph-sidetoc') &&
          !n.classList.contains('doc-toc') &&
          !n.classList.contains('fm-props')
        ) {
          var t = (n.textContent || '').replace(/\s+/g, ' ').trim();
          if (t) parts.push(t);
        }
        n = n.nextElementSibling;
      }
      out.push({
        id: ensureHeadingId(h, i),
        text: text,
        level: parseInt(h.tagName.charAt(1), 10),
        body: parts.join(' ')
      });
    }
    return out;
  }

  function queryWords(q) {
    return String(q || '')
      .trim()
      .toLowerCase()
      .split(/[\s,.;:!?«»"'()]+/)
      .filter(function (w) {
        return w.length > 1;
      });
  }

  function wordsRegex(words) {
    if (!words || !words.length) return null;
    return new RegExp(
      '(' +
        words
          .slice()
          .sort(function (a, b) {
            return b.length - a.length;
          })
          .map(function (w) {
            return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('|') +
        ')',
      'gi'
    );
  }

  function highlightHtml(text, words) {
    var safe = escHtml(text);
    var re = wordsRegex(words);
    if (!re) return safe;
    return safe.replace(re, '<mark class="ph-sidetoc__mark">$1</mark>');
  }

  function makeSnippetAround(text, index, len) {
    if (!text) return '';
    var from = Math.max(0, index - 36);
    var to = Math.min(text.length, index + len + 48);
    var slice = text.slice(from, to).replace(/\s+/g, ' ').trim();
    if (from > 0) slice = '\u2026' + slice;
    if (to < text.length) slice = slice + '\u2026';
    return slice;
  }

  function nearestSectionTitle(el) {
    var best = 'Документ';
    for (var i = 0; i < tocSections.length; i++) {
      var h = document.getElementById(tocSections[i].id);
      if (!h) continue;
      if (h === el || h.contains(el)) {
        best = tocSections[i].text;
        continue;
      }
      // h перед el → кандидат; как только h после el — дальше не смотрим
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        best = tocSections[i].text;
      } else {
        break;
      }
    }
    return best;
  }

  function clearDocHighlights() {
    var marks = document.querySelectorAll('mark.ph-doc-mark');
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var parent = m.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(m.textContent || ''), m);
      parent.normalize();
    }
  }

  function shouldSkipSearchNode(node) {
    var p = node.parentElement;
    if (!p) return true;
    if (p.closest('.ph-sidetoc, .ph-sidetoc-toggle, .diag-modal, .diag-host, .diag-nav, script, style, noscript')) {
      return true;
    }
    if (p.closest('mark.ph-doc-mark')) return true;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SVG|PATH)$/i.test(p.tagName)) {
      return true;
    }
    return false;
  }

  // Подсветка совпадений в теле документа + список хитов для сайдбара.
  function applyDocSearch(q) {
    clearDocHighlights();
    var words = queryWords(q);
    if (!words.length) return null;
    var re = wordsRegex(words);
    if (!re) return null;

    var root = document.querySelector('.markdown-body') || document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !/\S/.test(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        return shouldSkipSearchNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    var hits = [];
    for (var i = 0; i < textNodes.length; i++) {
      if (hits.length >= DOC_HIT_LIMIT) break;
      var node = textNodes[i];
      if (!node.parentNode) continue;
      var text = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;

      var frag = document.createDocumentFragment();
      var last = 0;
      var m;
      while ((m = re.exec(text)) && hits.length < DOC_HIT_LIMIT) {
        if (m.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        }
        var mark = document.createElement('mark');
        var hitId = 'ph-hit-' + hits.length;
        mark.className = 'ph-doc-mark';
        mark.id = hitId;
        mark.textContent = m[0];
        frag.appendChild(mark);
        hits.push({
          id: hitId,
          title: nearestSectionTitle(node.parentNode),
          snippet: makeSnippetAround(text, m.index, m[0].length),
          words: words
        });
        last = m.index + m[0].length;
      }
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }
      node.parentNode.replaceChild(frag, node);
    }

    // После wrap заголовки могли попасть внутрь mark — освежим title по id метки
    for (var h = 0; h < hits.length; h++) {
      var el = document.getElementById(hits[h].id);
      if (el) hits[h].title = nearestSectionTitle(el);
    }
    return hits;
  }

  function focusDocHit(el) {
    if (!el) return;
    var prev = document.querySelectorAll('mark.ph-doc-mark--focus');
    for (var i = 0; i < prev.length; i++) {
      prev[i].classList.remove('ph-doc-mark--focus');
    }
    el.classList.add('ph-doc-mark--focus');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(tocFocusTimer);
    tocFocusTimer = setTimeout(function () {
      el.classList.remove('ph-doc-mark--focus');
    }, 1600);
  }

  function ensureTocUi() {
    if (tocRoot) return;
    tocBtn = document.createElement('button');
    tocBtn.type = 'button';
    tocBtn.className = 'ph-sidetoc-toggle';
    tocBtn.setAttribute('aria-controls', 'ph-sidetoc');
    tocBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="8" y1="6" x2="21" y2="6"/>' +
      '<line x1="8" y1="12" x2="21" y2="12"/>' +
      '<line x1="8" y1="18" x2="21" y2="18"/>' +
      '<line x1="3" y1="6" x2="3.01" y2="6"/>' +
      '<line x1="3" y1="12" x2="3.01" y2="12"/>' +
      '<line x1="3" y1="18" x2="3.01" y2="18"/>' +
      '</svg>';
    tocBtn.addEventListener('click', function () {
      setTocOpen(!document.body.classList.contains('ph-toc-open'));
    });

    tocRoot = document.createElement('aside');
    tocRoot.id = 'ph-sidetoc';
    tocRoot.className = 'ph-sidetoc';
    tocRoot.setAttribute('aria-label', 'Навигация по документу');
    tocRoot.innerHTML =
      '<div class="ph-sidetoc__head">' +
      '<div class="ph-sidetoc__title-wrap">' +
      '<span class="ph-sidetoc__title">Навигация</span>' +
      '</div>' +
      '<button type="button" class="ph-sidetoc__close" title="Скрыть" aria-label="Скрыть навигацию">\u2715</button>' +
      '</div>' +
      '<div class="ph-sidetoc__search-wrap">' +
      '<label class="ph-sidetoc__search">' +
      '<svg class="ph-sidetoc__search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
      '</svg>' +
      '<input class="ph-sidetoc__search-input" type="search" placeholder="Поиск по документу" autocomplete="off" spellcheck="false" />' +
      '<button type="button" class="ph-sidetoc__search-clear" hidden title="Очистить" aria-label="Очистить поиск">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
      '</svg>' +
      '</button>' +
      '</label>' +
      '<div class="ph-sidetoc__meta" hidden></div>' +
      '</div>' +
      '<nav class="ph-sidetoc__nav"><ul class="ph-sidetoc__list"></ul></nav>';
    tocList = tocRoot.querySelector('.ph-sidetoc__list');
    tocSearch = tocRoot.querySelector('.ph-sidetoc__search-input');
    tocSearchWrap = tocRoot.querySelector('.ph-sidetoc__search');
    tocSearchClear = tocRoot.querySelector('.ph-sidetoc__search-clear');
    tocMeta = tocRoot.querySelector('.ph-sidetoc__meta');

    tocRoot.querySelector('.ph-sidetoc__close').addEventListener('click', function () {
      setTocOpen(false);
    });

    function syncSearchClear() {
      var filled = !!(tocSearch && tocSearch.value.length > 0);
      if (tocSearchWrap) tocSearchWrap.classList.toggle('is-filled', filled);
      if (tocSearchClear) tocSearchClear.hidden = !filled;
    }

    tocSearch.addEventListener('input', function () {
      tocQuery = tocSearch.value;
      syncSearchClear();
      clearTimeout(tocSearchTimer);
      tocSearchTimer = setTimeout(renderTocList, 120);
    });
    tocSearch.addEventListener('focus', function () {
      tocSearchWrap.classList.add('is-focused');
    });
    tocSearch.addEventListener('blur', function () {
      tocSearchWrap.classList.remove('is-focused');
    });
    tocSearchClear.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      tocSearch.value = '';
      tocQuery = '';
      syncSearchClear();
      renderTocList();
      tocSearch.focus();
    });

    tocList.addEventListener('click', function (e) {
      var toggleBtn = e.target.closest(
        '.ph-sidetoc__chevron, .ph-sidetoc__peck--toggle'
      );
      if (toggleBtn && tocList.contains(toggleBtn)) {
        e.preventDefault();
        e.stopPropagation();
        var item = toggleBtn.closest('.ph-sidetoc__item');
        if (!item) return;
        var cid = item.getAttribute('data-id') || '';
        var next = !item.classList.contains('is-collapsed');
        item.classList.toggle('is-collapsed', next);
        toggleBtn.setAttribute('aria-expanded', next ? 'false' : 'true');
        toggleBtn.title = next ? 'Развернуть' : 'Свернуть';
        if (cid) setTocCollapsed(cid, next);
        return;
      }

      var a = e.target.closest('a');
      if (!a || !tocList.contains(a)) return;
      e.preventDefault();
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      var target = id && document.getElementById(id);
      if (!target) return;
      // Только один active: ближайший item, не родители через contains()
      var selectedItem = a.closest('.ph-sidetoc__item');
      var items = tocList.querySelectorAll('.ph-sidetoc__item');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('is-selected', items[i] === selectedItem);
      }
      var links = tocList.querySelectorAll('a');
      for (var j = 0; j < links.length; j++) {
        links[j].classList.toggle('active', links[j] === a);
      }
      if (target.classList.contains('ph-doc-mark')) {
        focusDocHit(target);
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (a.blur) a.blur();
    });

    document.body.appendChild(tocBtn);
    document.body.appendChild(tocRoot);
    setTocOpen(tocIsOpen());
  }

  function renderTocList() {
    if (!tocList) return;
    var q = (tocSearch && tocSearch.value) || tocQuery || '';
    var words = queryWords(q);
    var results = words.length ? applyDocSearch(q) : (clearDocHighlights(), null);

    if (results && results.length) {
      tocMeta.hidden = false;
      tocMeta.textContent =
        'Найдено: ' +
        results.length +
        (results.length >= DOC_HIT_LIMIT ? '+' : '');
      var html = '';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html +=
          '<li class="ph-sidetoc__item ph-sidetoc__item--result">' +
          '<a href="#' +
          r.id +
          '" data-ph-hit="' +
          r.id +
          '">' +
          '<span class="ph-sidetoc__result-title">' +
          highlightHtml(r.title, r.words) +
          '</span>' +
          (r.snippet
            ? '<span class="ph-sidetoc__result-snippet">' +
              highlightHtml(r.snippet, r.words) +
              '</span>'
            : '') +
          '</a></li>';
      }
      tocList.innerHTML = html;
      return;
    }

    // Пустой запрос или «ничего не найдено» — полное оглавление по заголовкам.
    if (results && !results.length) {
      tocMeta.hidden = false;
      tocMeta.textContent = 'Ничего не найдено';
    } else {
      tocMeta.hidden = true;
      tocMeta.textContent = '';
    }
    renderTocHeadings();
  }

  function buildTocTree(items) {
    var roots = [];
    var stack = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var node = {
        id: it.id,
        text: it.text,
        level: it.level,
        children: []
      };
      while (stack.length && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }
      if (!stack.length) roots.push(node);
      else stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    return roots;
  }

  function chevronSvg() {
    return (
      '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" ' +
      'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="4 6 8 10 12 6"/>' +
      '</svg>'
    );
  }

  function renderTocBody(node, hasKids, badge) {
    var html =
      '<div class="ph-sidetoc__body">' +
      '<a class="ph-sidetoc__link" href="#' +
      escHtml(node.id) +
      '">' +
      '<span class="ph-sidetoc__label">' +
      escHtml(node.text) +
      '</span>' +
      '</a>';
    if (hasKids) {
      html +=
        '<span class="ph-sidetoc__badge" title="Подразделов: ' +
        badge +
        '">' +
        badge +
        '</span>';
    }
    html += '</div>';
    return html;
  }

  function renderTocNode(node, depth) {
    depth = depth || 0;
    var kids = node.children || [];
    var hasKids = kids.length > 0;
    var badge = hasKids ? kids.length : 0;
    var collapsed = hasKids && isTocCollapsed(node.id);
    var level = Math.min(6, Math.max(1, node.level || 1));
    // По глубине дерева (не по H1/H2/H3):
    // 0 — arrow; 1 — кружок на вертикали под arrow; 2+ — L-ветка без кружка
    var kind = depth === 0 ? 'root' : depth === 1 ? 'sub' : 'deep';
    var html =
      '<li class="ph-sidetoc__item ph-sidetoc__item--h' +
      level +
      ' ph-sidetoc__item--' +
      kind +
      (hasKids ? ' ph-sidetoc__item--branch' : ' ph-sidetoc__item--leaf') +
      (collapsed ? ' is-collapsed' : '') +
      '" data-id="' +
      escHtml(node.id) +
      '">';

    if (kind === 'deep') {
      // 3-й уровень: L от общей вертикали, без peck
      html += '<div class="ph-sidetoc__row ph-sidetoc__row--deep">';
      html += renderTocBody(node, hasKids, badge);
      html += '</div>';
    } else if (kind === 'sub') {
      html += '<div class="ph-sidetoc__row ph-sidetoc__row--sub">';
      if (hasKids) {
        html +=
          '<button type="button" class="ph-sidetoc__peck ph-sidetoc__peck--toggle" aria-expanded="' +
          (collapsed ? 'false' : 'true') +
          '" title="' +
          (collapsed ? 'Развернуть' : 'Свернуть') +
          '" aria-label="' +
          (collapsed ? 'Развернуть раздел' : 'Свернуть раздел') +
          '"></button>';
      } else {
        html += '<span class="ph-sidetoc__peck" aria-hidden="true"></span>';
      }
      html += renderTocBody(node, hasKids, badge);
      html += '</div>';
    } else {
      html += '<div class="ph-sidetoc__row ph-sidetoc__row--root">';
      if (hasKids) {
        html +=
          '<button type="button" class="ph-sidetoc__chevron" aria-expanded="' +
          (collapsed ? 'false' : 'true') +
          '" title="' +
          (collapsed ? 'Развернуть' : 'Свернуть') +
          '" aria-label="' +
          (collapsed ? 'Развернуть раздел' : 'Свернуть раздел') +
          '">' +
          chevronSvg() +
          '</button>';
      } else {
        html +=
          '<span class="ph-sidetoc__chevron-spacer" aria-hidden="true"></span>';
      }
      html +=
        '<a class="ph-sidetoc__link" href="#' +
        escHtml(node.id) +
        '">' +
        '<span class="ph-sidetoc__label">' +
        escHtml(node.text) +
        '</span>' +
        '</a>';
      if (hasKids) {
        html +=
          '<div class="ph-sidetoc__trail">' +
          '<span class="ph-sidetoc__badge" title="Подразделов: ' +
          badge +
          '">' +
          badge +
          '</span>' +
          '</div>';
      }
      html += '</div>';
    }

    if (hasKids) {
      // Дети корня — на общей вертикали; вложенные deep — без новой оси
      var childListClass =
        depth === 0
          ? 'ph-sidetoc__children ph-sidetoc__children--spine'
          : 'ph-sidetoc__children ph-sidetoc__children--nested';
      html += '<ul class="' + childListClass + '">';
      for (var i = 0; i < kids.length; i++) {
        html += renderTocNode(kids[i], depth + 1);
      }
      html += '</ul>';
    }
    html += '</li>';
    return html;
  }

  function renderTocHeadings() {
    var items = tocSections;
    if (!items.length) {
      tocList.innerHTML = '';
      return;
    }
    loadTocCollapsed();
    var tree = buildTocTree(items);
    var html2 = '';
    for (var k = 0; k < tree.length; k++) {
      html2 += renderTocNode(tree[k], 0);
    }
    tocList.innerHTML = html2;
  }

  function rebuildToc() {
    ensureTocUi();
    // Снять прошлые mark, чтобы collectSections видел чистый текст.
    clearDocHighlights();
    tocSections = collectSections();
    tocBtn.hidden = tocSections.length < 2;
    if (tocSections.length < 2) {
      setTocOpen(false);
      tocList.innerHTML = '';
      if (tocSearch) tocSearch.value = '';
      tocQuery = '';
      if (tocSearchWrap) tocSearchWrap.classList.remove('is-filled');
      if (tocSearchClear) tocSearchClear.hidden = true;
      if (tocMeta) {
        tocMeta.hidden = true;
        tocMeta.textContent = '';
      }
      return;
    }
    if (tocSearch && tocQuery && tocSearch.value !== tocQuery) {
      tocSearch.value = tocQuery;
    }
    if (tocSearchWrap) {
      tocSearchWrap.classList.toggle(
        'is-filled',
        !!(tocSearch && tocSearch.value.length)
      );
    }
    if (tocSearchClear) {
      tocSearchClear.hidden = !(tocSearch && tocSearch.value.length);
    }
    renderTocList();
    setTocOpen(tocIsOpen());
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scheduleTocRebuild() {
    clearTimeout(tocRefreshTimer);
    tocRefreshTimer = setTimeout(rebuildToc, 120);
  }

  window.addEventListener('vscode.markdown.updateContent', scheduleTocRebuild);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleTocRebuild);
  } else {
    scheduleTocRebuild();
  }

  // Дорисовка после подгрузки SVG с сервера PlantUML.
  try {
    var mo = new MutationObserver(function () {
      scheduleEnhance();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }
  setTimeout(scheduleEnhance, 0);
  setTimeout(scheduleEnhance, 500);
  setTimeout(scheduleTocRebuild, 300);
})();