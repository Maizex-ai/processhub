// ProcessHub Markdown Preview — плагин для ВСТРОЕННОГО превью Markdown.
// Работает через официальные точки расширения markdown-language-features:
//   - extendMarkdownIt: рендер YAML-шапки, PlantUML, Mermaid, TOC-карточки;
//   - media/preview.css: все стили превью;
//   - media/mermaid.min.js: локальный Mermaid — рендер в превью, без сети;
//   - media/preview.js: запуск Mermaid + модалка зума диаграмм.
// Mermaid рендерится локально (библиотека в составе расширения). PlantUML
// кодируется на стороне extension host (Node, есть zlib) и отдаётся
// PlantUML-сервером как SVG; адрес сервера настраивается.

'use strict';

const zlib = require('zlib');
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');

// vscode доступен в extension host; страхуемся на случай юнит-тестов вне IDE.
let vscode = null;
try { vscode = require('vscode'); } catch (e) { /* не в extension host */ }

// Кэш локального рендера (java -jar): ключ = sha1 исходника со skinparam.
const localPumlCache = new Map();

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

const PLANTUML_SERVER_DEFAULT = 'https://www.plantuml.com/plantuml';
const PLANTUML_DOCKER_DEFAULT = 'http://127.0.0.1:8080';

function phConfig(key, fallback) {
  if (vscode) {
    try {
      const v = vscode.workspace.getConfiguration('processhubMdPreview').get(key);
      if (v !== undefined && v !== null && v !== '') return v;
    } catch (e) { /* fallback */ }
  }
  return fallback;
}

// Режим: server (HTTP) | local (Java + plantuml.jar) | docker (локальный контейнер).
function plantUmlRenderMode() {
  const v = phConfig('plantumlRender', 'server');
  return v === 'local' || v === 'docker' ? v : 'server';
}

// Адрес PlantUML-сервера. В режиме docker — localhost, если свой URL не задан.
function plantUmlServer() {
  if (plantUmlRenderMode() === 'docker') {
    const custom = phConfig('plantumlServer', '');
    if (custom && custom !== PLANTUML_SERVER_DEFAULT) {
      return String(custom).replace(/\/+$/, '');
    }
    return PLANTUML_DOCKER_DEFAULT;
  }
  return String(phConfig('plantumlServer', PLANTUML_SERVER_DEFAULT)).replace(/\/+$/, '');
}

// Путь к java / jar. Если не заданы у нас — подхватываем настройки jebbs.plantuml.
function plantUmlJava() {
  const ours = phConfig('java', '');
  if (ours) return String(ours);
  if (vscode) {
    try {
      const v = vscode.workspace.getConfiguration('plantuml').get('java');
      if (v) return String(v);
    } catch (e) { /* ignore */ }
  }
  return 'java';
}

function plantUmlJar() {
  const ours = phConfig('plantumlJar', '');
  if (ours) return String(ours);
  if (vscode) {
    try {
      const v = vscode.workspace.getConfiguration('plantuml').get('jar');
      if (v) return String(v);
    } catch (e) { /* ignore */ }
  }
  return '';
}

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

function diagramErrorHtml(message, source) {
  return (
    '<div class="diag-host diag-plantuml diag-error">' +
    '<p class="diag-error-msg">' + esc(message) + '</p>' +
    (source
      ? '<pre class="diag-error-src"><code>' + esc(source) + '</code></pre>'
      : '') +
    '</div>\n'
  );
}

// Базовый skinparam для не-UML диаграмм (mindmap, gantt, salt и т.п.):
// только универсальные параметры, специфичные для sequence/class не шлём.
const PUML_SKIN_BASIC = `skinparam backgroundColor transparent
skinparam shadowing false
skinparam defaultFontColor #d4d4d4
skinparam ArrowColor #9aa4b2
skinparam lineColor #9aa4b2
`;

// Светлая тема: у PlantUML родная палитра светлая и читаемая,
// достаточно прозрачного фона (карточку рисует CSS) и отключения теней.
const PUML_SKIN_LIGHT = `skinparam backgroundColor transparent
skinparam shadowing false
`;

// Тёмная ли тема редактора (ColorThemeKind: 2 = Dark, 3 = HighContrast).
function isDarkEditorTheme() {
  if (vscode) {
    try {
      const kind = vscode.window.activeColorTheme.kind;
      return kind === 2 || kind === 3;
    } catch (e) { /* API недоступен — считаем тёмной */ }
  }
  return true;
}

// Тема диаграмм: dark | light | auto. По умолчанию dark — единый вид
// документов ProcessHub независимо от темы редактора у коллеги.
function useDarkDiagramTheme() {
  let mode = 'dark';
  if (vscode) {
    try {
      const v = vscode.workspace
        .getConfiguration('processhubMdPreview')
        .get('diagramTheme');
      if (v === 'light' || v === 'auto' || v === 'dark') mode = v;
    } catch (e) { /* оставляем dark */ }
  }
  if (mode === 'light') return false;
  if (mode === 'auto') return isDarkEditorTheme();
  return true;
}

function isPlantUmlLang(info) {
  return info === 'plantuml' || info === 'puml' || info === 'uml';
}

function preparePlantUmlBody(code) {
  let body = code.trim();
  const dark = useDarkDiagramTheme();
  const skinFull = dark ? PUML_SKIN : PUML_SKIN_LIGHT;
  const skinBasic = dark ? PUML_SKIN_BASIC : PUML_SKIN_LIGHT;
  if (/@startuml/.test(body)) {
    body = body.replace(/@startuml[^\n]*/, (m) => m + '\n' + skinFull);
  } else if (/@start\w+/.test(body)) {
    // Другие типы (@startmindmap, @startgantt, ...) — не оборачиваем в
    // @startuml (это ломает синтаксис), инжектим только базовую тему.
    body = body.replace(/@start\w+[^\n]*/, (m) => m + '\n' + skinBasic);
  } else {
    body = '@startuml\n' + skinFull + body + '\n@enduml';
  }
  return body;
}

// Офлайн: java -jar plantuml.jar -tsvg -pipe → SVG → data-URI (без сети).
function renderPlantUmlLocal(body) {
  const jar = plantUmlJar();
  if (!jar) {
    return diagramErrorHtml(
      'PlantUML (local): не задан путь к plantuml.jar. ' +
        'Settings → processhubMdPreview.plantumlJar ' +
        '(или plantuml.jar у расширения PlantUML).',
      body
    );
  }
  if (!fs.existsSync(jar)) {
    return diagramErrorHtml(
      'PlantUML (local): файл jar не найден: ' + jar,
      body
    );
  }
  const key = crypto.createHash('sha1').update(body).digest('hex');
  if (localPumlCache.has(key)) return localPumlCache.get(key);

  const java = plantUmlJava();
  try {
    const svg = execFileSync(
      java,
      ['-jar', jar, '-tsvg', '-pipe', '-quiet'],
      {
        input: body,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 60000,
        windowsHide: true,
        encoding: null,
      }
    );
    const url =
      'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    const html = diagramHtml(url, 'plantuml');
    localPumlCache.set(key, html);
    return html;
  } catch (e) {
    const detail = (e && (e.stderr || e.message)) || String(e);
    return diagramErrorHtml(
      'PlantUML (local): ошибка java/jar. Нужны Java и plantuml.jar. ' +
        String(detail).slice(0, 400),
      body
    );
  }
}

function renderPlantUml(code) {
  const body = preparePlantUmlBody(code);
  if (plantUmlRenderMode() === 'local') {
    return renderPlantUmlLocal(body);
  }
  // server и docker — один протокол /svg/<encoded>
  const url = plantUmlServer() + '/svg/' + encodePlantUml(body);
  return diagramHtml(url, 'plantuml');
}

// Mermaid рендерится ЛОКАЛЬНО в превью (media/mermaid.min.js + preview.js):
// сюда кладём исходник в <div class="mermaid">, клиент его отрисует.
// Текст диаграммы никуда не отправляется, работает офлайн.
function renderMermaid(code) {
  const themeClass = useDarkDiagramTheme() ? 'diag-theme-dark' : 'diag-theme-light';
  return (
    '<div class="diag-host diag-mermaid ' + themeClass + '">' +
    '<div class="mermaid">' + esc(code.trim()) + '</div>' +
    EXPAND_BTN +
    '</div>\n'
  );
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

function chipsHtml(items) {
  return items
    .map((i) => '<span class="fm-chip">' + esc(i) + '</span>')
    .join('');
}

function renderFrontMatterPanel(fm) {
  let rows = '';
  const lines = fm.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const m = lines[idx].match(/^([A-Za-z0-9_\- ]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const raw = unquote(m[2]);
    let valueHtml;
    const cfg = BADGE_FIELDS[key.toLowerCase()];
    if (raw === '') {
      // Блочный YAML-список:  key:\n  - a\n  - b
      const items = [];
      let n = idx + 1;
      while (n < lines.length && /^\s+-\s+/.test(lines[n])) {
        items.push(unquote(lines[n].replace(/^\s+-\s+/, '')));
        n++;
      }
      if (!items.length) continue; // пустое значение — строку не рисуем
      idx = n - 1;
      valueHtml = chipsHtml(items);
    } else if (cfg) {
      const dot = cfg.dot ? '<span class="fm-dot"></span>' : '';
      const base = cfg.base ? cfg.base + ' ' : '';
      valueHtml =
        '<span class="fm-badge ' + base + cfg.prefix + slugify(raw) + '">' +
        dot + esc(raw) + '</span>';
    } else if (/^\[.*\]$/.test(raw)) {
      valueHtml = chipsHtml(
        raw.slice(1, -1).split(',').map((s) => unquote(s)).filter(Boolean)
      );
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

    // Контент TOC: маркированный/нумерованный список ИЛИ абзац ссылок
    // (формат "строки-ссылки с жёсткими переносами", часто обрамлён "---").
    const isListOpen = (tt) =>
      tt === 'bullet_list_open' || tt === 'ordered_list_open';
    const isListClose = (tt) =>
      tt === 'bullet_list_close' || tt === 'ordered_list_close';
    let j = -1;
    let k = -1;
    let isList = false;
    for (let m = i + 3; m < end; m++) {
      if (isListOpen(t[m].type)) {
        isList = true;
        j = m;
        let depth = 0;
        for (k = m; k < end; k++) {
          if (isListOpen(t[k].type)) depth++;
          else if (isListClose(t[k].type)) {
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

// jebbs.plantuml тоже регистрирует markdown-it плагин и перехватывает
// ```plantuml / ```puml / ```uml (часто меняет тип токена на "plantuml").
// Мы переименовываем такие токены в свой тип ph_plantuml — тогда рендерим
// мы, с нашим сервером и тёмной темой, даже если PlantUML-расширение установлено.
function claimPlantUmlTokens(state) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'plantuml') {
      t.type = 'ph_plantuml';
      continue;
    }
    if (t.type !== 'fence') continue;
    const info = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
    if (isPlantUmlLang(info)) t.type = 'ph_plantuml';
  }
}

function resolveMarkdownUri(uri) {
  if (!vscode) return null;
  let target = uri;
  if (Array.isArray(target)) target = target[0];
  if (target && !(target instanceof vscode.Uri)) {
    if (target.fsPath) target = vscode.Uri.file(target.fsPath);
    else if (typeof target === 'string') target = vscode.Uri.file(target);
    else target = null;
  }
  if (
    !target &&
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document.languageId === 'markdown'
  ) {
    target = vscode.window.activeTextEditor.document.uri;
  }
  return target || null;
}

// Locked preview: не следует за курсором/другой вкладкой — удобно читать длинные UC.
// Обычный preview оставляем как запасной путь.
// Скролл-sync с редактором НЕ пишем в settings.json — только клиентский
// перехват в media/preview.js (контур расширения, чужие настройки не трогаем).
async function openMarkdownPreview(uri) {
  if (!vscode) return;
  const target = resolveMarkdownUri(uri);
  const cmds = [
    'markdown.showLockedPreviewToSide',
    'markdown.showPreviewToSide',
  ];
  for (let i = 0; i < cmds.length; i++) {
    try {
      if (target) return await vscode.commands.executeCommand(cmds[i], target);
      return await vscode.commands.executeCommand(cmds[i]);
    } catch (e) {
      /* пробуем следующий вариант */
    }
  }
}

function activate(context) {
  if (vscode && context) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'processhubMdPreview.openPreview',
        openMarkdownPreview
      )
    );
  }
  return {
    extendMarkdownIt(md) {
      md.block.ruler.before('table', 'ph_front_matter', frontMatterRule);
      md.renderer.rules.ph_front_matter = (tokens, idx) =>
        renderFrontMatterPanel(tokens[idx].content);

      md.renderer.rules.ph_plantuml = (tokens, idx) =>
        renderPlantUml(tokens[idx].content);
      // На случай, если чужой плагин оставит тип "plantuml" и наш core-rule
      // ещё не успел отработать (или был перезаписан) — рендерим и его.
      md.renderer.rules.plantuml = (tokens, idx) =>
        renderPlantUml(tokens[idx].content);

      const defaultFence =
        md.renderer.rules.fence ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };
      md.renderer.rules.fence = function (tokens, idx, options, env, self) {
        const token = tokens[idx];
        const info = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
        if (isPlantUmlLang(info)) {
          return renderPlantUml(token.content);
        }
        if (info === 'mermaid') {
          return renderMermaid(token.content);
        }
        // Явный синтаксис панели свойств: блок ```properties (или ```props /
        // ```frontmatter) рендерится панелью из ЛЮБОГО места документа —
        // идентификация по метке, а не по позиции.
        if (info === 'properties' || info === 'props' || info === 'frontmatter') {
          const panel = renderFrontMatterPanel(token.content);
          if (panel) return panel;
        }
        // Запасной путь: если фронт-маттер пришёл yaml-код-блоком в начале файла.
        if (info === 'yaml' && token.map && token.map[0] === 0) {
          const panel = renderFrontMatterPanel(token.content);
          if (panel) return panel;
        }
        return defaultFence(tokens, idx, options, env, self);
      };

      // Поздно в пайплайне: забираем токены у jebbs.plantuml (и аналогов).
      md.core.ruler.push('ph_plantuml_claim', claimPlantUmlTokens);
      md.core.ruler.push('ph_doc_toc', tocRule);
      return md;
    },
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
