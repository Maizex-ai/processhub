({
  // Please visit the URL below for more information:
  // https://shd101wyy.github.io/markdown-preview-enhanced/#/extend-parser

  onWillParseMarkdown: async function (markdown) {
    // --- Тёмная тема для PlantUML (сервер отдаёт картинку, красим через skinparam) ---
    // ВАЖНО: сгруппированные skinparam обязаны быть МНОГОСТРОЧНЫМИ (свойство на строке,
    // без ';'). Однострочный вид "skinparam x { a; b }" вызывает Syntax Error.
    const PUML_SKIN = [
      "skinparam backgroundColor transparent",
      "skinparam shadowing false",
      "skinparam defaultFontColor #d4d4d4",
      "skinparam ArrowColor #9aa4b2",
      "skinparam ArrowFontColor #b9c0cc",
      "skinparam lineColor #9aa4b2",
      "skinparam NoteBackgroundColor #2a2d2e",
      "skinparam NoteBorderColor #4a4d4e",
      "skinparam NoteFontColor #d4d4d4",
      "skinparam rectangle {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "}",
      "skinparam node {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "}",
      "skinparam component {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "}",
      "skinparam class {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "  AttributeFontColor #d4d4d4",
      "  StereotypeFontColor #9aa4b2",
      "}",
      "skinparam object {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "}",
      "skinparam usecase {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "}",
      "skinparam activity {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "  DiamondBackgroundColor #2a2d2e",
      "  DiamondBorderColor #5a5d5e",
      "  DiamondFontColor #d4d4d4",
      "}",
      "skinparam state {",
      "  BackgroundColor #2a2d2e",
      "  BorderColor #5a5d5e",
      "  FontColor #d4d4d4",
      "}",
      "skinparam sequence {",
      "  ArrowColor #9aa4b2",
      "  LifeLineBorderColor #5a5d5e",
      "  LifeLineBackgroundColor #2a2d2e",
      "  ParticipantBackgroundColor #2a2d2e",
      "  ParticipantBorderColor #5a5d5e",
      "  ParticipantFontColor #d4d4d4",
      "  ActorBackgroundColor #2a2d2e",
      "  ActorBorderColor #5a5d5e",
      "  ActorFontColor #d4d4d4",
      "  BoxBackgroundColor #252627",
      "  BoxBorderColor #4a4d4e",
      "  BoxFontColor #d4d4d4",
      "  DividerBackgroundColor #2a2d2e",
      "  DividerBorderColor #5a5d5e",
      "  DividerFontColor #d4d4d4",
      "  ReferenceBackgroundColor #2a2d2e",
      "  ReferenceBorderColor #5a5d5e",
      "  ReferenceFontColor #d4d4d4",
      "  ReferenceHeaderBackgroundColor #3a3d3e",
      "  GroupBorderColor #6a6d6e",
      "  GroupBackgroundColor #3a3d3e",
      "  GroupFontColor #f0f0f0",
      "  GroupHeaderFontColor #f0f0f0",
      "  GroupBodyBackgroundColor transparent",
      "}",
      "",
    ].join("\n");

    const themePlantuml = (md) =>
      md.replace(/```plantuml\s*\n([\s\S]*?)```/g, (all, body) => {
        let code = body;
        if (/@startuml/.test(code)) {
          code = code.replace(/@startuml[^\n]*\n/, (m) => m + PUML_SKIN);
        } else {
          code =
            "@startuml\n" + PUML_SKIN + code.replace(/\n?$/, "\n") + "@enduml\n";
        }
        return "```plantuml\n" + code + "```";
      });

    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const unquote = (s) => s.trim().replace(/^["']|["']$/g, "");

    // --- Ручное "## Содержание" (список ссылок) → карточка .doc-toc ---
    const wrapToc = (md) => {
      const lines = md.split("\n");
      const hi = lines.findIndex((l) =>
        /^#{1,6}\s+(Содержание|Оглавление|Contents|Table of Contents)\s*$/i.test(
          l
        )
      );
      if (hi < 0) return md;
      let end = lines.length;
      for (let i = hi + 1; i < lines.length; i++) {
        if (/^#{1,6}\s+\S/.test(lines[i])) {
          end = i;
          break;
        }
      }
      const section = lines.slice(hi + 1, end).join("\n");
      const items = [];
      const linkRe = /\[([^\]]+)\]\((#[^)]+)\)/g;
      let m;
      while ((m = linkRe.exec(section)) !== null) {
        items.push({ text: m[1].trim(), href: m[2] });
      }
      if (!items.length) return md;
      const lis = items
        .map((it) => `<li><a href="${it.href}">${esc(it.text)}</a></li>`)
        .join("");
      const card =
        `<nav class="doc-toc"><div class="doc-toc-title">Содержание</div>` +
        `<ul class="doc-toc-list">${lis}</ul></nav>`;
      const before = lines.slice(0, hi).join("\n");
      const tail = lines.slice(end).join("\n");
      return (before ? before + "\n" : "") + card + "\n\n" + tail;
    };

    const transform = (md) => wrapToc(themePlantuml(md));

    if (!markdown.startsWith("---")) return transform(markdown);
    const close = markdown.indexOf("\n---", 3);
    if (close < 0) return transform(markdown);

    const fm = markdown.slice(3, close);
    let rest = transform(markdown.slice(close + 4));
    if (rest.startsWith("\n")) rest = rest.slice(1);

    // Поля-перечисления → бейджи. dot: с точкой; base: доп. класс поля.
    const BADGE_FIELDS = {
      status: { dot: true, prefix: "fm-badge--" },
      stage: { dot: true, base: "fm-stage", prefix: "fm-stage--" },
      class: { dot: false, base: "fm-class", prefix: "fm-class--" },
      audience: { dot: false, base: "fm-audience", prefix: "fm-audience--" },
    };

    let rows = "";
    for (const line of fm.split("\n")) {
      const m = line.match(/^([A-Za-z0-9_\- ]+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const raw = unquote(m[2]);
      let valueHtml;
      const cfg = BADGE_FIELDS[key.toLowerCase()];
      if (cfg) {
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const dot = cfg.dot ? `<span class="fm-dot"></span>` : "";
        const base = cfg.base ? cfg.base + " " : "";
        valueHtml =
          `<span class="fm-badge ${base}${cfg.prefix}${slug}">` +
          `${dot}${esc(raw)}</span>`;
      } else if (/^\[.*\]$/.test(raw)) {
        const items = raw
          .slice(1, -1)
          .split(",")
          .map((s) => unquote(s))
          .filter(Boolean);
        valueHtml = items
          .map((i) => `<span class="fm-chip">${esc(i)}</span>`)
          .join("");
      } else {
        valueHtml = `<span class="fm-val">${esc(raw)}</span>`;
      }
      const keySlug = key.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      rows +=
        `<div class="fm-row"><span class="fm-key fm-key--${keySlug}">${esc(
          key
        )}</span>` + `<span class="fm-value">${valueHtml}</span></div>`;
    }
    if (!rows) return transform(markdown);

    const panel =
      `<div class="fm-props"><div class="fm-title">Properties</div>${rows}</div>`;
    return panel + "\n\n" + rest;
  },

  onDidParseMarkdown: async function (html) {
    // Модал для диаграмм: кнопка "раскрыть" в углу → оверлей с зумом и панорамой.
    // Требует markdown-preview-enhanced.enableScriptExecution: true.
    const zoom = `
<script>
(function(){
  if (window.__mpeDiagZoom) return;
  window.__mpeDiagZoom = true;

  var SEL = '.mermaid, .plantuml, pre.mume-plantuml, p:has(> img[src*="plantuml"])';
  var st = { s:1, tx:0, ty:0, drag:false, lx:0, ly:0 };
  var overlay, stage, content;

  function apply(){ content.style.transform = 'translate('+st.tx+'px,'+st.ty+'px) scale('+st.s+')'; }
  function zoomBy(f){ st.s = Math.min(10, Math.max(0.1, st.s*f)); apply(); }
  function fit(){
    st.s=1; st.tx=0; st.ty=0; apply();
    requestAnimationFrame(function(){
      var sr = stage.getBoundingClientRect();
      var cr = content.getBoundingClientRect();
      if (cr.width && cr.height){
        var k = Math.min((sr.width-80)/cr.width, (sr.height-80)/cr.height, 1);
        if (k>0 && isFinite(k)) st.s = k;
        apply();
      }
    });
  }
  function close(){ overlay.classList.remove('open'); content.innerHTML=''; }
  function open(node){
    if(!node) return;
    if(!overlay) build();
    content.innerHTML='';
    content.appendChild(node.cloneNode(true));
    overlay.classList.add('open');
    fit();
  }
  function build(){
    overlay = document.createElement('div');
    overlay.className = 'diag-modal';
    overlay.innerHTML =
      '<div class="diag-modal__stage"><div class="diag-modal__content"></div></div>' +
      '<div class="diag-modal__bar">' +
        '<button data-a="in" title="Приблизить">+</button>' +
        '<button data-a="out" title="Отдалить">−</button>' +
        '<button data-a="reset" title="По размеру окна">↺</button>' +
        '<button data-a="close" title="Закрыть">✕</button>' +
      '</div>';
    document.body.appendChild(overlay);
    stage = overlay.querySelector('.diag-modal__stage');
    content = overlay.querySelector('.diag-modal__content');
    overlay.querySelector('.diag-modal__bar').addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return; e.stopPropagation();
      var a = b.getAttribute('data-a');
      if(a==='in') zoomBy(1.25); else if(a==='out') zoomBy(0.8);
      else if(a==='reset') fit(); else close();
    });
    stage.addEventListener('wheel', function(e){ e.preventDefault(); zoomBy(e.deltaY<0?1.1:0.9); }, {passive:false});
    stage.addEventListener('mousedown', function(e){ st.drag=true; st.lx=e.clientX; st.ly=e.clientY; stage.classList.add('grabbing'); });
    window.addEventListener('mousemove', function(e){ if(!st.drag) return; st.tx+=e.clientX-st.lx; st.ty+=e.clientY-st.ly; st.lx=e.clientX; st.ly=e.clientY; apply(); });
    window.addEventListener('mouseup', function(){ st.drag=false; stage.classList.remove('grabbing'); });
    stage.addEventListener('click', function(e){ if(e.target===stage) close(); });
    window.addEventListener('keydown', function(e){ if(e.key==='Escape' && overlay && overlay.classList.contains('open')) close(); });
  }

  function inner(box){ return box.querySelector('svg') || box.querySelector('img') || box; }

  function decorate(){
    var list = document.querySelectorAll(SEL);
    for (var i=0;i<list.length;i++){
      var box = list[i];
      if (box.__diag) continue;
      if (box.closest && box.closest('.diag-modal')) continue;
      box.__diag = true;
      var wrap = document.createElement('div');
      wrap.className = 'diag-host';
      box.parentNode.insertBefore(wrap, box);
      wrap.appendChild(box);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'diag-expand';
      btn.title = 'Раскрыть на весь экран';
      btn.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3H5a2 2 0 0 0-2 2v3'/><path d='M21 8V5a2 2 0 0 0-2-2h-3'/><path d='M3 16v3a2 2 0 0 0 2 2h3'/><path d='M16 21h3a2 2 0 0 0 2-2v-3'/></svg>";
      (function(bx){
        btn.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); open(inner(bx)); });
      })(box);
      wrap.appendChild(btn);
    }
  }

  function boot(){ decorate(); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  var t;
  try {
    var mo = new MutationObserver(function(){ clearTimeout(t); t=setTimeout(decorate,150); });
    mo.observe(document.body, {childList:true, subtree:true});
  } catch(e){}
  setTimeout(decorate,400); setTimeout(decorate,1200); setTimeout(decorate,2500);
})();
</script>`;
    return html + zoom;
  },
})
