// ProcessHub Markdown Preview — плагин для ВСТРОЕННОГО превью Markdown.
// Работает через официальные точки расширения markdown-language-features:
//   - extendMarkdownIt: рендер YAML-шапки, PlantUML, Mermaid, TOC-карточки;
//   - media/preview.css: все стили превью;
//   - media/preview.js: модалка зума диаграмм (кнопка рендерится прямо в HTML).
// Диаграммы кодируются на стороне extension host (Node, есть zlib) и
// отдаются серверами plantuml.com / kroki.io как SVG-картинки.

'use strict';

const zlib = require('zlib');

// ---------------------------------------------------------------------------
// Кодировщики URL диаграмм
// ---------------------------------------------------------------------------

// PlantUML: raw deflate + собственный base64-алфавит PlantUML.
const PUML_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

function encodePlantUml(text) {
  const data = zlib.deflateRawSync(Buffer.from(text, 'utf8'), { level: 9 });
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const b1 = data[i];
    const b2 = i + 1 < data.length ? data[i + 1] : 0;
    const b3 = i + 2 < data.length ? data[i + 2] : 0;
    out += PUML_ALPHABET[b1 >> 2];
    out += PUML_ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)];
    out += PUML_ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)];
    out += PUML_ALPHABET[b3 & 0x3f];
  }
  return out;
}

// Kroki (Mermaid и др.): zlib deflate + base64url.
function encodeKroki(text) {
  return zlib
    .deflateSync(Buffer.from(text, 'utf8'), { level: 9 })
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ---------------------------------------------------------------------------
// Тёмная тема PlantUML (skinparam). Группы обязаны быть многострочными.
// ---------------------------------------------------------------------------

const PUML_SKIN = `skinparam backgroundColor transparent
skinparam shadowing false
skinparam defaultFontColor #d4d4d4
skinparam ArrowColor #9aa4b2
skinparam ArrowFontColor #b9c0cc
skinparam lineColor #9aa4b2
skinparam NoteBackgroundColor #2a2d2e
skinparam NoteBorderColor #4a4d4e
skinparam NoteFontColor #d4d4d4
skinparam rectangle {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
}
skinparam node {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
}
skinparam component {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
}
skinparam class {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
  AttributeFontColor #d4d4d4
  StereotypeFontColor #9aa4b2
}
skinparam object {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
}
skinparam usecase {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
}
skinparam activity {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
  DiamondBackgroundColor #2a2d2e
  DiamondBorderColor #5a5d5e
  DiamondFontColor #d4d4d4
}
skinparam state {
  BackgroundColor #2a2d2e
  BorderColor #5a5d5e
  FontColor #d4d4d4
}
skinparam sequence {
  ArrowColor #9aa4b2
  LifeLineBorderColor #5a5d5e
  LifeLineBackgroundColor #2a2d2e
  ParticipantBackgroundColor #2a2d2e
  ParticipantBorderColor #5a5d5e
  ParticipantFontColor #d4d4d4
  ActorBackgroundColor #2a2d2e
  ActorBorderColor #5a5d5e
  ActorFontColor #d4d4d4
  BoxBackgroundColor #252627
  BoxBorderColor #4a4d4e
  BoxFontColor #d4d4d4
  DividerBackgroundColor #2a2d2e
  DividerBorderColor #5a5d5e
  DividerFontColor #d4d4d4
  ReferenceBackgroundColor #2a2d2e
  ReferenceBorderColor #5a5d5e
  ReferenceFontColor #d4d4d4
  ReferenceHeaderBackgroundColor #3a3d3e
  GroupBorderColor #6a6d6e
  GroupBackgroundColor #3a3d3e
  GroupFontColor #f0f0f0
  GroupHeaderFontColor #f0f0f0
  GroupBodyBackgroundColor transparent
}
`;

const PLANTUML_SERVER = 'https://www.plantuml.com/plantuml';

// Тёмная тема Mermaid — init-директива, если автор не задал свою.
const MERMAID_INIT =
  '%%{init: {"theme":"dark","themeVariables":{"darkMode":true,' +
  '"background":"#1e1e1e","primaryColor":"#2a2d2e",' +
  '"primaryTextColor":"#d4d4d4","primaryBorderColor":"#5a5d5e",' +
  '"lineColor":"#9aa4b2","secondaryColor":"#2a2d2e",' +
  '"tertiaryColor":"#252627"}}}%%';

// ---------------------------------------------------------------------------
// HTML-хелперы
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EXPAND_BTN =
  '<button class="diag-expand" type="button" title="Раскрыть на весь экран">' +
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' " +
  "stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M8 3H5a2 2 0 0 0-2 2v3'/><path d='M21 8V5a2 2 0 0 0-2-2h-3'/>" +
  "<path d='M3 16v3a2 2 0 0 0 2 2h3'/><path d='M16 21h3a2 2 0 0 0 2-2v-3'/>" +
  '</svg></button>';

function diagramHtml(url, kind) {
  return (
    '<div class="diag-host diag-' + kind + '">' +
    '<img class="diag-img" src="' + url + '" alt="' + kind + ' diagram">' +
    EXPAND_BTN +
    '</div>\n'
  );
}

function renderPlantUml(code) {
  let body = code.trim();
  if (/@startuml/.test(body)) {
    body = body.replace(/@startuml[^\n]*/, (m) => m + '\n' + PUML_SKIN);
  } else {
    body = '@startuml\n' + PUML_SKIN + body + '\n@enduml';
  }
  const url = PLANTUML_SERVER + '/svg/' + encodePlantUml(body);
  return diagramHtml(url, 'plantuml');
}

function renderMermaid(code) {
  let body = code.trim();
  if (!/^\s*%%\{\s*init/.test(body)) {
    body = MERMAID_INIT + '\n' + body;
  }
  const url = 'https://kroki.io/mermaid/svg/' + encodeKroki(body);
  return diagramHtml(url, 'mermaid');
}

// ---------------------------------------------------------------------------
// YAML-шапка -> панель "Properties" (порт логики из .crossnote/parser.js)
// ---------------------------------------------------------------------------

const BADGE_FIELDS = {
  status: { dot: true, prefix: 'fm-badge--' },
  stage: { dot: true, base: 'fm-stage', prefix: 'fm-stage--' },
  class: { dot: false, base: 'fm-class', prefix: 'fm-class--' },
  audience: { dot: false, base: 'fm-audience', prefix: 'fm-audience--' },
};

function unquote(s) {
  return s.trim().replace(/^["']|["']$/g, '');
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function renderFrontMatterPanel(fm) {
  let rows = '';
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_\- ]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const raw = unquote(m[2]);
    let valueHtml;
    const cfg = BADGE_FIELDS[key.toLowerCase()];
    if (cfg) {
      const dot = cfg.dot ? '<span class="fm-dot"></span>' : '';
      const base = cfg.base ? cfg.base + ' ' : '';
      valueHtml =
        '<span class="fm-badge ' + base + cfg.prefix + slugify(raw) + '">' +
        dot + esc(raw) + '</span>';
    } else if (/^\[.*\]$/.test(raw)) {
      valueHtml = raw
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s))
        .filter(Boolean)
        .map((i) => '<span class="fm-chip">' + esc(i) + '</span>')
        .join('');
    } else {
      valueHtml = '<span class="fm-val">' + esc(raw) + '</span>';
    }
    rows +=
      '<div class="fm-row"><span class="fm-key fm-key--' + slugify(key) + '">' +
      esc(key) + '</span><span class="fm-value">' + valueHtml + '</span></div>';
  }
  if (!rows) return '';
  return (
    '<div class="fm-props"><div class="fm-title">Properties</div>' +
    rows + '</div>\n'
  );
}

// Блочное правило markdown-it: YAML-шапка (--- ... ---) в самом начале файла.
// Работает при "markdown.preview.frontMatter": "show".
function frontMatterRule(state, startLine, endLine, silent) {
  if (startLine !== 0) return false;
  const first = state.src
    .slice(state.bMarks[0] + state.tShift[0], state.eMarks[0])
    .trim();
  if (first !== '---') return false;
  let close = -1;
  for (let ln = 1; ln < endLine; ln++) {
    const s = state.src
      .slice(state.bMarks[ln] + state.tShift[ln], state.eMarks[ln])
      .trim();
    if (s === '---' || s === '...') { close = ln; break; }
  }
  if (close < 0) return false;
  if (silent) return true;
  const token = state.push('ph_front_matter', '', 0);
  token.content = state.getLines(1, close, 0, false);
  token.map = [0, close + 1];
  token.markup = '---';
  state.line = close + 1;
  return true;
}

// ---------------------------------------------------------------------------
// "## Содержание" + список ссылок -> карточка <nav class="doc-toc">
// ---------------------------------------------------------------------------

function tocRule(state) {
  const t = state.tokens;
  for (let i = 0; i < t.length - 2; i++) {
    if (
      t[i].type !== 'heading_open' ||
      !/^h[2-4]$/.test(t[i].tag) ||
      t[i + 1].type !== 'inline' ||
      !/^(Содержание|Оглавление|Contents|Table of Contents)$/i.test(
        t[i + 1].content.trim()
      )
    ) {
      continue;
    }

    // Граница секции — следующий заголовок (или конец документа).
    let end = t.length;
    for (let m = i + 3; m < t.length; m++) {
      if (t[m].type === 'heading_open') { end = m; break; }
    }

    // Контент TOC: маркированный список ИЛИ абзац ссылок
    // (формат "строки-ссылки с жёсткими переносами", часто обрамлён "---").
    let j = -1;
    let k = -1;
    let isList = false;
    for (let m = i + 3; m < end; m++) {
      if (t[m].type === 'bullet_list_open') {
        isList = true;
        j = m;
        let depth = 0;
        for (k = m; k < end; k++) {
          if (t[k].type === 'bullet_list_open') depth++;
          else if (t[k].type === 'bullet_list_close') {
            depth--;
            if (depth === 0) break;
          }
        }
        break;
      }
      if (
        t[m].type === 'paragraph_open' &&
        t[m + 1] &&
        t[m + 1].type === 'inline' &&
        (t[m + 1].children || []).some((c) => c.type === 'link_open')
      ) {
        j = m;
        k = m + 2; // paragraph_close
        break;
      }
    }
    if (j < 0 || k < 0 || k >= end) continue;

    // Убираем "---" (hr) вокруг содержания — внутри карточки они не нужны.
    for (let m = end - 1; m >= i + 3; m--) {
      if (t[m].type === 'hr' && (m < j || m > k)) {
        t.splice(m, 1);
        if (m < j) { j--; k--; }
        end--;
      }
    }

    t[i].attrJoin('class', 'doc-toc-title');
    t[j].attrJoin('class', isList ? 'doc-toc-list' : 'doc-toc-list doc-toc-para');

    const open = new state.Token('html_block', '', 0);
    open.content = '<nav class="doc-toc">\n';
    const close = new state.Token('html_block', '', 0);
    close.content = '</nav>\n';
    t.splice(k + 1, 0, close);
    t.splice(i, 0, open);
    return;
  }
}

// ---------------------------------------------------------------------------
// Точка входа расширения
// ---------------------------------------------------------------------------

function activate() {
  return {
    extendMarkdownIt(md) {
      md.block.ruler.before('table', 'ph_front_matter', frontMatterRule);
      md.renderer.rules.ph_front_matter = (tokens, idx) =>
        renderFrontMatterPanel(tokens[idx].content);

      const defaultFence =
        md.renderer.rules.fence ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };
      md.renderer.rules.fence = function (tokens, idx, options, env, self) {
        const token = tokens[idx];
        const info = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
        if (info === 'plantuml' || info === 'puml') {
          return renderPlantUml(token.content);
        }
        if (info === 'mermaid') {
          return renderMermaid(token.content);
        }
        // Запасной путь: если фронт-маттер пришёл yaml-код-блоком в начале файла.
        if (info === 'yaml' && token.map && token.map[0] === 0) {
          const panel = renderFrontMatterPanel(token.content);
          if (panel) return panel;
        }
        return defaultFence(tokens, idx, options, env, self);
      };

      md.core.ruler.push('ph_doc_toc', tocRule);
      return md;
    },
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
