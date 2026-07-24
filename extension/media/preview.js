// ProcessHub Markdown Preview — клиентский скрипт встроенного превью.
// Mermaid (локально) + inline pan/zoom на карточках диаграмм + модалка fullscreen.
(function () {
  'use strict';
  if (window.__phDiagZoom) return;
  window.__phDiagZoom = true;

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

  function enhanceHosts() {
    var hosts = document.querySelectorAll('.diag-host:not(.diag-error)');
    for (var i = 0; i < hosts.length; i++) {
      enhanceOne(hosts[i]);
    }
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
  // Sidebar TOC — навигация по заголовкам + поиск по разделам
  // ---------------------------------------------------------------------------

  var TOC_KEY = 'ph-sidetoc-open';
  var tocRoot = null;
  var tocList = null;
  var tocBtn = null;
  var tocSearch = null;
  var tocSearchWrap = null;
  var tocMeta = null;
  var tocSections = [];
  var tocRefreshTimer = null;
  var tocSearchTimer = null;
  var tocQuery = '';

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
      tocBtn.title = open ? 'Скрыть содержание' : 'Показать содержание';
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

  function highlightHtml(text, words) {
    var safe = escHtml(text);
    if (!words || !words.length) return safe;
    var re = new RegExp(
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
    return safe.replace(re, '<mark class="ph-sidetoc__mark">$1</mark>');
  }

  function makeSnippet(body, words) {
    if (!body) return '';
    var lower = body.toLowerCase();
    var idx = -1;
    var hit = '';
    for (var i = 0; i < words.length; i++) {
      var p = lower.indexOf(words[i]);
      if (p >= 0 && (idx < 0 || p < idx)) {
        idx = p;
        hit = words[i];
      }
    }
    if (idx < 0) return '';
    var from = Math.max(0, idx - 36);
    var to = Math.min(body.length, idx + hit.length + 48);
    var slice = body.slice(from, to).replace(/\s+/g, ' ').trim();
    if (from > 0) slice = '\u2026' + slice;
    if (to < body.length) slice = slice + '\u2026';
    return slice;
  }

  function searchSections(q) {
    var words = queryWords(q);
    if (!words.length) return null;
    var results = [];
    for (var i = 0; i < tocSections.length; i++) {
      var sec = tocSections[i];
      var hay = (sec.text + ' ' + sec.body).toLowerCase();
      var ok = true;
      for (var w = 0; w < words.length; w++) {
        if (hay.indexOf(words[w]) < 0) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      results.push({
        id: sec.id,
        title: sec.text,
        level: sec.level,
        snippet: makeSnippet(sec.body, words),
        words: words
      });
    }
    return results;
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
    tocRoot.setAttribute('aria-label', 'Содержание документа');
    tocRoot.innerHTML =
      '<div class="ph-sidetoc__head">' +
      '<div class="ph-sidetoc__title-wrap">' +
      '<span class="ph-sidetoc__title">Содержание</span>' +
      '</div>' +
      '<button type="button" class="ph-sidetoc__close" title="Скрыть" aria-label="Скрыть содержание">\u2715</button>' +
      '</div>' +
      '<div class="ph-sidetoc__search-wrap">' +
      '<label class="ph-sidetoc__search">' +
      '<svg class="ph-sidetoc__search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
      '</svg>' +
      '<input class="ph-sidetoc__search-input" type="search" placeholder="Поиск по документу" autocomplete="off" spellcheck="false" />' +
      '</label>' +
      '<div class="ph-sidetoc__meta" hidden></div>' +
      '</div>' +
      '<nav class="ph-sidetoc__nav"><ul class="ph-sidetoc__list"></ul></nav>';
    tocList = tocRoot.querySelector('.ph-sidetoc__list');
    tocSearch = tocRoot.querySelector('.ph-sidetoc__search-input');
    tocSearchWrap = tocRoot.querySelector('.ph-sidetoc__search');
    tocMeta = tocRoot.querySelector('.ph-sidetoc__meta');

    tocRoot.querySelector('.ph-sidetoc__close').addEventListener('click', function () {
      setTocOpen(false);
    });

    tocSearch.addEventListener('input', function () {
      tocQuery = tocSearch.value;
      tocSearchWrap.classList.toggle('is-filled', tocQuery.trim().length > 0);
      clearTimeout(tocSearchTimer);
      tocSearchTimer = setTimeout(renderTocList, 120);
    });
    tocSearch.addEventListener('focus', function () {
      tocSearchWrap.classList.add('is-focused');
    });
    tocSearch.addEventListener('blur', function () {
      tocSearchWrap.classList.remove('is-focused');
    });

    tocList.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a || !tocList.contains(a)) return;
      e.preventDefault();
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      var target = id && document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        tocList.querySelectorAll('a').forEach(function (x) {
          x.classList.toggle('active', x === a);
        });
        if (a.blur) a.blur();
      }
    });

    document.body.appendChild(tocBtn);
    document.body.appendChild(tocRoot);
    setTocOpen(tocIsOpen());
  }

  function renderTocList() {
    if (!tocList) return;
    var q = (tocSearch && tocSearch.value) || tocQuery || '';
    var results = searchSections(q);

    if (results && results.length) {
      tocMeta.hidden = false;
      tocMeta.textContent = 'Найдено разделов: ' + results.length;
      var html = '';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html +=
          '<li class="ph-sidetoc__item ph-sidetoc__item--result">' +
          '<a href="#' +
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

    // Пустой запрос или «ничего не найдено» — показываем полное содержание.
    if (results && !results.length) {
      tocMeta.hidden = false;
      tocMeta.textContent = 'Ничего не найдено';
    } else {
      tocMeta.hidden = true;
      tocMeta.textContent = '';
    }
    renderTocHeadings();
  }

  function renderTocHeadings() {
    var items = tocSections;
    if (!items.length) {
      tocList.innerHTML = '';
      return;
    }
    var min = 6;
    for (var j = 0; j < items.length; j++) {
      if (items[j].level < min) min = items[j].level;
    }
    var html2 = '';
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var depth = Math.max(0, it.level - min);
      html2 +=
        '<li class="ph-sidetoc__item ph-sidetoc__item--' +
        depth +
        '">' +
        '<a href="#' +
        it.id +
        '">' +
        escHtml(it.text) +
        '</a></li>';
    }
    tocList.innerHTML = html2;
  }

  function rebuildToc() {
    ensureTocUi();
    tocSections = collectSections();
    tocBtn.hidden = tocSections.length < 2;
    if (tocSections.length < 2) {
      setTocOpen(false);
      tocList.innerHTML = '';
      if (tocSearch) tocSearch.value = '';
      tocQuery = '';
      if (tocSearchWrap) tocSearchWrap.classList.remove('is-filled');
      if (tocMeta) {
        tocMeta.hidden = true;
        tocMeta.textContent = '';
      }
      return;
    }
    if (tocSearch && tocQuery && tocSearch.value !== tocQuery) {
      tocSearch.value = tocQuery;
      tocSearchWrap.classList.toggle('is-filled', tocQuery.trim().length > 0);
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
      enhanceHosts();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }
  setTimeout(enhanceHosts, 0);
  setTimeout(enhanceHosts, 500);
  setTimeout(scheduleTocRebuild, 300);
})();