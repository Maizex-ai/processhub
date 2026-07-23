// ProcessHub Markdown Preview — клиентский скрипт встроенного превью.
// Кнопка .diag-expand рендерится в HTML самим расширением (extension.js),
// здесь только модалка с зумом/панорамой и делегированный клик.
(function () {
  'use strict';
  if (window.__phDiagZoom) return;
  window.__phDiagZoom = true;

  // --- Локальный рендер Mermaid (библиотека media/mermaid.min.js) ---
  // Тёмная тема задаётся здесь; %%{init}%% в самой диаграмме имеет приоритет.
  var mermaidReady = false;
  function isLightTheme() {
    var c = document.body.classList;
    return c.contains('vscode-light') || c.contains('vscode-high-contrast-light');
  }
  function runMermaid() {
    if (typeof mermaid === 'undefined') return;
    if (!mermaidReady) {
      mermaid.initialize(isLightTheme()
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
      // При синтаксической ошибке Mermaid сам рисует сообщение в блоке.
      mermaid.run({ nodes: nodes }).catch(function () {});
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runMermaid);
  } else {
    runMermaid();
  }
  // Встроенное превью обновляет контент без перезагрузки скриптов —
  // это официальное событие для дорисовки после обновления.
  window.addEventListener('vscode.markdown.updateContent', runMermaid);

  var overlay = null, stage = null, content = null;
  var st = { s: 1, tx: 0, ty: 0, drag: false, lx: 0, ly: 0 };

  function apply() {
    content.style.transform =
      'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.s + ')';
  }
  function zoomBy(f) {
    st.s = Math.min(10, Math.max(0.1, st.s * f));
    apply();
  }
  function fit() {
    st.s = 1; st.tx = 0; st.ty = 0; apply();
    requestAnimationFrame(function () {
      var sr = stage.getBoundingClientRect();
      var cr = content.getBoundingClientRect();
      if (cr.width && cr.height) {
        var k = Math.min((sr.width - 80) / cr.width, (sr.height - 80) / cr.height, 1);
        if (k > 0 && isFinite(k)) st.s = k;
        apply();
      }
    });
  }
  function closeModal() {
    overlay.classList.remove('open');
    content.innerHTML = '';
  }
  function openModal(node) {
    if (!node) return;
    if (!overlay) buildModal();
    content.innerHTML = '';
    content.appendChild(node.cloneNode(true));
    overlay.classList.add('open');
    fit();
  }
  function buildModal() {
    overlay = document.createElement('div');
    overlay.className = 'diag-modal';
    overlay.innerHTML =
      '<div class="diag-modal__stage"><div class="diag-modal__content"></div></div>' +
      '<div class="diag-modal__bar">' +
      '<button data-a="in" title="Приблизить">+</button>' +
      '<button data-a="out" title="Отдалить">\u2212</button>' +
      '<button data-a="reset" title="По размеру окна">\u21BA</button>' +
      '<button data-a="close" title="Закрыть">\u2715</button>' +
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
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
    stage.addEventListener('mousedown', function (e) {
      st.drag = true; st.lx = e.clientX; st.ly = e.clientY;
      stage.classList.add('grabbing');
    });
    window.addEventListener('mousemove', function (e) {
      if (!st.drag) return;
      st.tx += e.clientX - st.lx; st.ty += e.clientY - st.ly;
      st.lx = e.clientX; st.ly = e.clientY;
      apply();
    });
    window.addEventListener('mouseup', function () {
      st.drag = false;
      stage.classList.remove('grabbing');
    });
    stage.addEventListener('click', function (e) {
      if (e.target === stage) closeModal();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
        closeModal();
      }
    });
  }

  // Кнопки .diag-expand присутствуют в отрендеренном HTML — ловим кликом.
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.diag-expand') : null;
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    var host = b.closest('.diag-host');
    var node = host && (host.querySelector('img') || host.querySelector('svg'));
    if (node) openModal(node);
  }, true);
})();
