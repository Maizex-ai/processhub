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
      if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
        closeModal();
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

  // Дорисовка после подгрузки SVG с сервера PlantUML.
  try {
    var mo = new MutationObserver(function () {
      enhanceHosts();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }
  setTimeout(enhanceHosts, 0);
  setTimeout(enhanceHosts, 500);
})();
