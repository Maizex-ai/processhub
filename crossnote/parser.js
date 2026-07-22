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

  // Клиентский JS (модалка диаграмм + кнопка "раскрыть") вынесен в
  // ~/.crossnote/head.html: HTML из onDidParseMarkdown прогоняется через
  // DOMPurify, который вырезает <script>, поэтому инжект сюда не работает.
  onDidParseMarkdown: async function (html) {
    return html;
  },
})
