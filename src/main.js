import 'monaco-editor/min/vs/editor/editor.main.css';

import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {save} from '@tauri-apps/plugin-dialog';
import {writeFile, writeTextFile} from '@tauri-apps/plugin-fs';
import {renderMermaid, THEMES} from 'beautiful-mermaid';
import mermaid from 'mermaid';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import {installAntiInspect} from './anti-inspect.js';
import {applyI18n, getLocale, setLocale, t} from './i18n.js';

if (typeof self !== 'undefined') {
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}

const MERMAID_LANGUAGE_ID = 'mermaid';
const MONACO_THEME_LIGHT = 'mermaid-studio-light';
const MONACO_THEME_DARK = 'mermaid-studio-dark';

installAntiInspect();

// ===== Example diagrams =====
const EXAMPLES = {
  flowchart: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Check Logs]
    E --> F[Fix Issue]
    F --> B
    C --> G[Deploy]
    G --> H[Monitor]
    H --> I{Issues?}
    I -->|Yes| D
    I -->|No| J[Success!]`,

  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading : fetch
    Loading --> Success : resolve
    Loading --> Error : reject
    Error --> Loading : retry
    Success --> Idle : reset
    Error --> Idle : dismiss
    Success --> [*]`,

  sequence: `sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant D as Database
    U->>C: Click Login
    C->>S: POST /auth
    S->>D: Query user
    D-->>S: User data
    S-->>C: JWT Token
    C-->>U: Redirect to Dashboard`,

  class: `classDiagram
    class Animal {
      +String name
      +int age
      +makeSound()
    }
    class Dog {
      +String breed
      +fetch()
    }
    class Cat {
      +bool indoor
      +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
};

// ===== DOM refs =====
const editorContainer = document.getElementById('mermaid-editor');
const previewOutput = document.getElementById('preview-output');
const previewPane = document.getElementById('preview-pane');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const statusBadge = document.getElementById('status-indicator');
const btnThemeSelect = document.getElementById('btn-theme-select');
const themeSelectLabel = document.getElementById('theme-select-label');
const themePopup = document.getElementById('theme-popup');
const btnExport = document.getElementById('btn-export');
const exportMenu = document.getElementById('export-menu');
const exportSvgButton = document.getElementById('export-svg');
const exportPngButton = document.getElementById('export-png');
const exportPdfButton = document.getElementById('export-pdf');
const exportPngQualityInput = document.getElementById('export-png-quality');
const exportPngQualityValue =
    document.getElementById('export-png-quality-value');
const btnSettings = document.getElementById('btn-settings');
const settingsShortcutHint = document.querySelector('[data-settings-shortcut]');
const btnExamples = document.getElementById('btn-examples');
const examplesShortcutHint = document.querySelector('[data-examples-shortcut]');
const previewContainer = document.getElementById('preview-container');
const toolbar = document.getElementById('toolbar');

// ===== State =====
let currentSvg = '';
let currentRenderEngineUsed = 'bautiful-mermaid';
let debounceTimer = null;
let zoomScale = 1;
let zoomMode = 'fit';
let syncZoomWithCurrentMode = () => {};
let zoomCenterTimer = null;
let mermaidEditor = null;
let currentTheme = 'tokyo-night';
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;
const ZOOM_ANIMATION_MS = 170;
const DEFAULT_UI_FONT =
    '-apple-system, BlinkMacSystemFont, \'SF Pro Text\', \'Helvetica Neue\', sans-serif';
const DEFAULT_CODE_FONT =
    '\'SF Mono\', \'JetBrains Mono\', Menlo, Monaco, monospace';
const DEFAULT_DIAGRAM_FONT = DEFAULT_UI_FONT;
const DEFAULT_UI_FONT_SIZE = 14;
const MIN_UI_FONT_SIZE = 12;
const MAX_UI_FONT_SIZE = 24;
const DEFAULT_EDITOR_FONT_SIZE = 12.5;
const DEFAULT_EDITOR_LINE_HEIGHT = 21;
const DEFAULT_APPEARANCE = 'system';
const DEFAULT_LIGHT_CHART_THEME = 'github-light';
const DEFAULT_DARK_CHART_THEME = 'github-dark';
const DEFAULT_PNG_QUALITY = 85;
const DEFAULT_EXPORT_FORMAT = 'svg';
const DEFAULT_PDF_RASTER_SCALE = 4;
const DEFAULT_PDF_DPI = 96;
const PDF_MONO_FONT_STACK =
    '\'JetBrains Mono\', \'SF Mono\', \'Fira Code\', \'Menlo\', \'Monaco\', monospace';
const SVG_EXPORT_STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'visibility',
];
const SVG_COLOR_PROPS = new Set(['fill', 'stroke']);
const SETTINGS_EVENT = 'settings-updated';
const OPEN_SETTINGS_EVENT = 'open-settings-window';
const OPEN_EXAMPLE_LIBRARY_EVENT = 'open-example-library-window';
const INSERT_EXAMPLE_TEMPLATE_EVENT = 'example-library-insert-template';
const RENDER_ENGINE_BEAUTIFUL = 'bautiful-mermaid';
const RENDER_ENGINE_BEAUTIFUL_LEGACY = 'beautiful-mermaid';
const RENDER_ENGINE_MERMAID_JS = 'mermaid-js/mermaid';
const DEFAULT_RENDER_ENGINE = RENDER_ENGINE_BEAUTIFUL;
const EXPORT_FORMATS = new Set(['svg', 'png', 'pdf']);
const IS_MACOS = (() => {
  if (typeof navigator === 'undefined') return false;
  const platform = String(navigator.userAgentData?.platform || navigator.platform || '');
  return /mac|iphone|ipad|ipod/i.test(platform);
})();
const FONT_AUTOFILL_LIST = [
  'Inter, sans-serif',
  'JetBrains Sans, sans-serif',
  'Fira Sans, sans-serif',
  'Nunito Sans, sans-serif',
  'Arial, sans-serif',
  'Helvetica Neue, sans-serif',
  'Times New Roman, serif',
  'Georgia, serif',
  'Courier New, monospace',
];
const BEAUTIFUL_SUPPORTED_HEADER_PATTERNS = [
  /^(graph|flowchart)\b/i,
  /^stateDiagram(?:-v2)?\b/i,
  /^sequenceDiagram\b/i,
  /^classDiagram\b/i,
  /^erDiagram\b/i,
];
const BEAUTIFUL_UNSUPPORTED_HEADER_PATTERNS = [
  /^architecture-beta\b/i,
  /^block-beta\b/i,
  /^c4context\b/i,
  /^c4container\b/i,
  /^c4component\b/i,
  /^c4dynamic\b/i,
  /^c4deployment\b/i,
  /^gantt\b/i,
  /^gitGraph\b/i,
  /^journey\b/i,
  /^kanban\b/i,
  /^mindmap\b/i,
  /^packet-beta\b/i,
  /^pie\b/i,
  /^quadrantChart\b/i,
  /^requirementDiagram\b/i,
  /^sankey-beta\b/i,
  /^timeline\b/i,
  /^xychart-beta\b/i,
];
let mermaidJsRenderSerial = 0;

// ===== Theme selector setup =====
function formatThemeName(name) {
  return name.split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
}

function initThemes() {
  const themeNames = Object.keys(THEMES);
  themePopup.innerHTML = '';
  themeNames.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'theme-option' + (name === currentTheme ? ' selected' : '');
    btn.dataset.theme = name;

    // Color dot from the theme's accent color
    const colors = THEMES[name] || {};
    const dot = document.createElement('span');
    dot.className = 'theme-color-dot';
    dot.style.backgroundColor = colors.primaryColor || colors.bg || '#888';
    btn.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = formatThemeName(name);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      currentTheme = name;
      themeSelectLabel.textContent = formatThemeName(name);
      // Update selected state
      themePopup.querySelectorAll('.theme-option')
          .forEach((o) => o.classList.remove('selected'));
      btn.classList.add('selected');
      themePopup.classList.remove('open');
      render();
    });

    themePopup.appendChild(btn);
  });

  themeSelectLabel.textContent = formatThemeName(currentTheme);
}

function initThemePopup() {
  btnThemeSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    themePopup.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!themePopup.contains(e.target) && e.target !== btnThemeSelect) {
      themePopup.classList.remove('open');
    }
  });
}

function getDiagramFont() {
  return getSettings().chartFont;
}

function normalizeChartThemeName(rawValue, fallback) {
  const candidate = String(rawValue || '').trim();
  if (candidate && Object.prototype.hasOwnProperty.call(THEMES, candidate)) {
    return candidate;
  }
  if (fallback && Object.prototype.hasOwnProperty.call(THEMES, fallback)) {
    return fallback;
  }
  const themeNames = Object.keys(THEMES);
  return themeNames[0] || 'tokyo-night';
}

function normalizeFontValue(rawValue, fallback) {
  const value = String(rawValue || '').trim();
  return value || fallback;
}

function parseUiFontSize(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return DEFAULT_UI_FONT_SIZE;
  return Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(n)));
}

function resolveEditorTypography(uiFontSize) {
  const size = parseUiFontSize(uiFontSize);
  const scale = size / DEFAULT_UI_FONT_SIZE;
  return {
    fontSize: Number((DEFAULT_EDITOR_FONT_SIZE * scale).toFixed(1)),
    lineHeight: Math.round(DEFAULT_EDITOR_LINE_HEIGHT * scale),
  };
}

function resolveChartFontFromStorage() {
  const chartFont = normalizeFontValue(localStorage.getItem('chartFont'), '');
  if (chartFont) return chartFont;

  const customLegacy = normalizeFontValue(localStorage.getItem('customDiagramFont'), '');
  if (customLegacy) return customLegacy;

  const legacy = normalizeFontValue(localStorage.getItem('diagramFont'), '');
  if (legacy && legacy !== '__custom__') return legacy;

  return DEFAULT_DIAGRAM_FONT;
}

function applyUiFont(fontFamily) {
  const value = normalizeFontValue(fontFamily, DEFAULT_UI_FONT);
  document.documentElement.style.setProperty('--app-ui-font', value);
}

function applyUiFontSize(fontSize) {
  const value = parseUiFontSize(fontSize);
  document.documentElement.style.setProperty('--app-ui-font-size', `${value}px`);
  if (mermaidEditor) {
    const typography = resolveEditorTypography(value);
    mermaidEditor.updateOptions({
      fontSize: typography.fontSize,
      lineHeight: typography.lineHeight,
    });
  }
}

function applyCodeFont(fontFamily) {
  if (!mermaidEditor) return;
  const value = normalizeFontValue(fontFamily, DEFAULT_CODE_FONT);
  mermaidEditor.updateOptions({fontFamily: value});
}

function getSettings() {
  return {
    appearance: localStorage.getItem('appearance') || DEFAULT_APPEARANCE,
    uiFont: normalizeFontValue(localStorage.getItem('uiFont'), DEFAULT_UI_FONT),
    uiFontSize: parseUiFontSize(localStorage.getItem('uiFontSize')),
    codeFont: normalizeFontValue(localStorage.getItem('codeFont'), DEFAULT_CODE_FONT),
    chartFont: resolveChartFontFromStorage(),
    diagramFont: localStorage.getItem('diagramFont') || DEFAULT_DIAGRAM_FONT,
    customDiagramFont: localStorage.getItem('customDiagramFont') || '',
    renderEngine: normalizeRenderEngine(localStorage.getItem('renderEngine')),
    pngQuality: parsePngQuality(localStorage.getItem('pngQuality')),
    exportDefaultFormat: normalizeExportFormat(
        localStorage.getItem('exportDefaultFormat')),
    fontAutofill: parseAutofillFonts(localStorage.getItem('fontAutofill')) ||
        FONT_AUTOFILL_LIST,
    defaultLightChartTheme: normalizeChartThemeName(
        localStorage.getItem('defaultLightChartTheme'),
        DEFAULT_LIGHT_CHART_THEME),
    defaultDarkChartTheme: normalizeChartThemeName(
        localStorage.getItem('defaultDarkChartTheme'),
        DEFAULT_DARK_CHART_THEME),
  };
}

function resolveStartupChartTheme(settings) {
  const isDark = settings.appearance === 'dark' ||
      (settings.appearance !== 'light' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark ? settings.defaultDarkChartTheme : settings.defaultLightChartTheme;
}

function normalizeExportFormat(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  return EXPORT_FORMATS.has(value) ? value : DEFAULT_EXPORT_FORMAT;
}

function shortcutForPrimaryCommand(letter) {
  const key = String(letter || '').toUpperCase();
  return IS_MACOS ? `⌘${key}` : `Ctrl+${key}`;
}

function shortcutForMenuCommand() {
  return IS_MACOS ? '⌘⇧E' : 'Ctrl+Shift+E';
}

function shortcutForSettingsCommand() {
  return IS_MACOS ? '⌘,' : 'Ctrl+,';
}

function getDefaultExportFormat() {
  return normalizeExportFormat(localStorage.getItem('exportDefaultFormat'));
}

function updateExportMenuDefaultUi() {
  const defaultFormat = getDefaultExportFormat();
  const exportButtons = {
    svg: exportSvgButton,
    png: exportPngButton,
    pdf: exportPdfButton,
  };

  Object.entries(exportButtons).forEach(([format, button]) => {
    if (!button) return;
    const isDefault = format === defaultFormat;
    button.classList.toggle('is-default-export', isDefault);
    const defaultBadge = button.querySelector('[data-export-default-badge]');
    if (defaultBadge instanceof HTMLElement) {
      defaultBadge.hidden = !isDefault;
    }
    const shortcutLabel = button.querySelector('[data-export-shortcut]');
    if (shortcutLabel instanceof HTMLElement) {
      shortcutLabel.hidden = !isDefault;
      shortcutLabel.textContent = shortcutForPrimaryCommand('o');
    }
  });
}

function updateShortcutLabels() {
  const exportLabel = t('export');
  if (btnExport) {
    btnExport.title =
        `${exportLabel} (${shortcutForPrimaryCommand('o')} / ${shortcutForMenuCommand()})`;
  }
  if (btnSettings) {
    btnSettings.title =
        `${t('settings')} (${shortcutForSettingsCommand()})`;
  }
  if (btnExamples) {
    btnExamples.title =
        `${t('example_library')} (${shortcutForPrimaryCommand('l')})`;
  }
  if (settingsShortcutHint instanceof HTMLElement) {
    settingsShortcutHint.hidden = false;
    settingsShortcutHint.textContent = shortcutForSettingsCommand();
  }
  if (examplesShortcutHint instanceof HTMLElement) {
    examplesShortcutHint.hidden = false;
    examplesShortcutHint.textContent = shortcutForPrimaryCommand('l');
  }
}

function normalizeRenderEngine(rawValue) {
  const value = String(rawValue || '').trim();
  if (value === RENDER_ENGINE_MERMAID_JS) return RENDER_ENGINE_MERMAID_JS;
  if (value === RENDER_ENGINE_BEAUTIFUL ||
      value === RENDER_ENGINE_BEAUTIFUL_LEGACY) {
    return RENDER_ENGINE_BEAUTIFUL;
  }
  return DEFAULT_RENDER_ENGINE;
}

function isBeautifulEngine(engine) {
  return normalizeRenderEngine(engine) === RENDER_ENGINE_BEAUTIFUL;
}

function applyMermaidJsDefaultZoom(engine) {
  if (normalizeRenderEngine(engine) !== RENDER_ENGINE_MERMAID_JS) return;
  zoomMode = 'manual';
  zoomScale = 1;
  syncZoomWithCurrentMode();
}

function getFirstDiagramHeader(text) {
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    return trimmed;
  }
  return '';
}

function isSupportedByBeautifulMermaid(text) {
  const header = getFirstDiagramHeader(text);
  if (!header) return true;
  return BEAUTIFUL_SUPPORTED_HEADER_PATTERNS.some((pattern) => pattern.test(header));
}

function isUnsupportedForBeautifulMermaid(text) {
  const header = getFirstDiagramHeader(text);
  if (!header || isSupportedByBeautifulMermaid(text)) return false;
  return BEAUTIFUL_UNSUPPORTED_HEADER_PATTERNS.some(
      (pattern) => pattern.test(header));
}

function shouldFallbackToMermaidJs(text, error) {
  if (isUnsupportedForBeautifulMermaid(text)) return true;
  if (isSupportedByBeautifulMermaid(text)) return false;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('invalid mermaid header');
}

function buildMermaidJsConfig(colors, options = {}) {
  const htmlLabels = options.htmlLabels !== false;
  const isDark = isDarkAppearance();
  const fallbackBg = isDark ? '#1f2937' : '#ffffff';
  const fallbackFg = isDark ? '#e5e7eb' : '#111827';
  const bg = canonicalizeCssColor(colors.bg || fallbackBg) || fallbackBg;
  const fg = canonicalizeCssColor(colors.fg || fallbackFg) || fallbackFg;
  const line = canonicalizeCssColor(colors.line || mixColors(fg, bg, 30)) ||
      mixColors(fg, bg, 30);
  const accent = canonicalizeCssColor(colors.accent || mixColors(fg, bg, 55)) ||
      mixColors(fg, bg, 55);
  const muted = canonicalizeCssColor(colors.muted || mixColors(fg, bg, 60)) ||
      mixColors(fg, bg, 60);
  const surface = canonicalizeCssColor(colors.surface || mixColors(fg, bg, 6)) ||
      mixColors(fg, bg, 6);
  const border = canonicalizeCssColor(colors.border || mixColors(fg, bg, 25)) ||
      mixColors(fg, bg, 25);
  const clusterBkg = mixColors(surface, bg, 55);
  const noteBkg = mixColors(surface, bg, 75);
  const edgeLabelBackground = mixColors(bg, surface, 80);
  const bgHex = toMermaidHex(bg, fallbackBg);
  const fgHex = toMermaidHex(fg, fallbackFg);
  const lineHex = toMermaidHex(line, '#6b7280');
  const accentHex = toMermaidHex(accent, '#3b82f6');
  const mutedHex = toMermaidHex(muted, '#6b7280');
  const surfaceHex = toMermaidHex(surface, '#f8fafc');
  const borderHex = toMermaidHex(border, '#9ca3af');
  const clusterBkgHex = toMermaidHex(clusterBkg, surfaceHex);
  const noteBkgHex = toMermaidHex(noteBkg, surfaceHex);
  const edgeLabelBgHex = toMermaidHex(edgeLabelBackground, bgHex);
  const activationBgHex = toMermaidHex(mixColors(surface, bg, 82), surfaceHex);
  const sectionBkgHex = toMermaidHex(mixColors(surface, bg, 65), surfaceHex);
  const sectionBkgHex2 = toMermaidHex(mixColors(surface, bg, 50), surfaceHex);
  const sectionBkgHex3 = toMermaidHex(mixColors(surface, bg, 35), surfaceHex);
  const cScale0Hex = surfaceHex;
  const cScale1Hex = toMermaidHex(mixColors(surface, bg, 70), surfaceHex);
  const cScale2Hex = toMermaidHex(mixColors(surface, bg, 55), surfaceHex);
  const cScale3Hex = toMermaidHex(mixColors(surface, bg, 40), surfaceHex);
  const cScale4Hex = toMermaidHex(mixColors(surface, bg, 25), surfaceHex);
  const cScale5Hex = toMermaidHex(mixColors(surface, bg, 10), surfaceHex);

  return {
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    fontFamily: getDiagramFont(),
    themeVariables: {
      darkMode: isDark,
      background: bgHex,
      textColor: fgHex,
      titleColor: fgHex,
      fontFamily: getDiagramFont(),

      primaryColor: surfaceHex,
      primaryTextColor: fgHex,
      primaryBorderColor: borderHex,
      secondaryColor: surfaceHex,
      secondaryTextColor: fgHex,
      secondaryBorderColor: borderHex,
      tertiaryColor: bgHex,
      tertiaryTextColor: mutedHex,
      tertiaryBorderColor: lineHex,

      lineColor: lineHex,
      defaultLinkColor: lineHex,
      edgeLabelBackground: edgeLabelBgHex,

      mainBkg: surfaceHex,
      secondBkg: bgHex,
      tertiaryBkg: bgHex,
      nodeBorder: borderHex,
      clusterBkg: clusterBkgHex,
      clusterBorder: borderHex,

      actorBkg: surfaceHex,
      actorBorder: borderHex,
      actorTextColor: fgHex,
      labelBoxBkgColor: surfaceHex,
      labelBoxBorderColor: borderHex,
      signalColor: lineHex,
      signalTextColor: fgHex,
      noteBkgColor: noteBkgHex,
      noteBorderColor: borderHex,
      noteTextColor: fgHex,
      activationBkgColor: activationBgHex,
      activationBorderColor: borderHex,
      loopTextColor: fgHex,
      sectionBkgColor: sectionBkgHex,
      sectionBkgColor2: sectionBkgHex2,
      sectionBkgColor3: sectionBkgHex3,

      cScale0: cScale0Hex,
      cScale1: cScale1Hex,
      cScale2: cScale2Hex,
      cScale3: cScale3Hex,
      cScale4: cScale4Hex,
      cScale5: cScale5Hex,

      pie1: accentHex,
      pie2: lineHex,
      pie3: mutedHex,
    },
    flowchart: {
      useMaxWidth: false,
      htmlLabels,
    },
  };
}

async function renderWithBeautifulMermaid(code, colors) {
  return renderMermaid(code, {
    ...colors,
    font: getDiagramFont(),
    padding: 48,
    nodeSpacing: 28,
    layerSpacing: 44,
  });
}

async function renderWithMermaidJs(code, colors, options = {}) {
  mermaid.initialize(buildMermaidJsConfig(colors, options));
  mermaidJsRenderSerial += 1;
  const renderId = `mermaid-js-${Date.now()}-${mermaidJsRenderSerial}`;
  const rendered = await mermaid.render(renderId, code);
  if (typeof rendered === 'string') return rendered;
  if (rendered && typeof rendered.svg === 'string') return rendered.svg;
  throw new Error('Failed to render with mermaid-js/mermaid');
}

function parseAutofillFonts(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned =
        parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
    return cleaned.length ? cleaned : null;
  } catch (_) {
    return null;
  }
}

function parsePngQuality(rawValue) {
  const n = Number(rawValue);
  if (Number.isFinite(n)) {
    return Math.min(100, Math.max(10, Math.round(n)));
  }
  return DEFAULT_PNG_QUALITY;
}

async function openSettingsWindow() {
  const existing = WebviewWindow.getByLabel('settings');
  if (existing) {
    try {
      await existing.show();
      await existing.setFocus();
      return;
    } catch (_) {
      // If the old handle is stale, fall back to creating a new window.
    }
  }

  const window = new WebviewWindow('settings', {
    title: 'Settings',
    url: '/settings.html',
    devtools: false,
    width: 900,
    height: 700,
    minWidth: 760,
    minHeight: 620,
    resizable: true,
    center: true,
    decorations: true,
    titleBarStyle: 'Overlay',
    hiddenTitle: true,
    trafficLightPosition: {x: 14, y: 20},
  });

  window.once('tauri://error', (error) => {
    console.error('Failed to open settings window', error);
  });
}

async function openExampleLibraryWindow() {
  const existing = WebviewWindow.getByLabel('example-library');
  if (existing) {
    try {
      await existing.show();
      await existing.setFocus();
      return;
    } catch (_) {
      // If the old handle is stale, fall back to creating a new window.
    }
  }

  const window = new WebviewWindow('example-library', {
    title: 'Example Library',
    url: '/examples.html',
    devtools: false,
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 420,
    resizable: true,
    center: true,
    decorations: true,
    titleBarStyle: 'Overlay',
    hiddenTitle: true,
    trafficLightPosition: {x: 14, y: 20},
  });

  window.once('tauri://error', (error) => {
    console.error('Failed to open example library window', error);
  });
}

function initSettingsWindow() {
  btnSettings.addEventListener('click', async (e) => {
    e.stopPropagation();
    await openSettingsWindow();
  });

  listen(OPEN_SETTINGS_EVENT, async () => {
    await openSettingsWindow();
  });

  listen(SETTINGS_EVENT, (event) => {
    const payload = event.payload || {};
    if (payload.appearance) {
      localStorage.setItem('appearance', String(payload.appearance));
      applyAppearance(payload.appearance);
    }
    if (typeof payload.uiFont === 'string') {
      const nextUiFont = normalizeFontValue(payload.uiFont, DEFAULT_UI_FONT);
      localStorage.setItem('uiFont', nextUiFont);
      applyUiFont(nextUiFont);
    }
    if (payload.uiFontSize !== undefined) {
      const nextUiFontSize = parseUiFontSize(payload.uiFontSize);
      localStorage.setItem('uiFontSize', String(nextUiFontSize));
      applyUiFontSize(nextUiFontSize);
    }
    if (typeof payload.codeFont === 'string') {
      const nextCodeFont = normalizeFontValue(payload.codeFont, DEFAULT_CODE_FONT);
      localStorage.setItem('codeFont', nextCodeFont);
      applyCodeFont(nextCodeFont);
    }
    if (typeof payload.chartFont === 'string') {
      const nextChartFont = normalizeFontValue(payload.chartFont, DEFAULT_DIAGRAM_FONT);
      localStorage.setItem('chartFont', nextChartFont);
      localStorage.setItem('diagramFont', '__custom__');
      localStorage.setItem('customDiagramFont', nextChartFont);
    }
    if (typeof payload.defaultLightChartTheme === 'string') {
      localStorage.setItem(
          'defaultLightChartTheme',
          normalizeChartThemeName(
              payload.defaultLightChartTheme,
              DEFAULT_LIGHT_CHART_THEME));
    }
    if (typeof payload.defaultDarkChartTheme === 'string') {
      localStorage.setItem(
          'defaultDarkChartTheme',
          normalizeChartThemeName(
              payload.defaultDarkChartTheme,
              DEFAULT_DARK_CHART_THEME));
    }
    if (payload.diagramFont) {
      localStorage.setItem('diagramFont', String(payload.diagramFont));
    }
    if (typeof payload.customDiagramFont === 'string') {
      localStorage.setItem('customDiagramFont', payload.customDiagramFont);
    }
    if (payload.pngQuality !== undefined) {
      setPngQuality(parsePngQuality(payload.pngQuality));
    }
    if (payload.exportDefaultFormat !== undefined) {
      localStorage.setItem(
          'exportDefaultFormat',
          normalizeExportFormat(payload.exportDefaultFormat));
      updateExportMenuDefaultUi();
    }
    if (payload.locale) {
      setLocale(payload.locale);
      applyI18n(document);
      updateShortcutLabels();
    }
    if (Array.isArray(payload.fontAutofill)) {
      localStorage.setItem(
          'fontAutofill', JSON.stringify(payload.fontAutofill));
    }
    if (payload.renderEngine !== undefined) {
      const normalizedRenderEngine = normalizeRenderEngine(payload.renderEngine);
      localStorage.setItem('renderEngine', normalizedRenderEngine);
      applyMermaidJsDefaultZoom(normalizedRenderEngine);
    }
    render();
  });
}

function initExampleLibraryEvents() {
  listen(OPEN_EXAMPLE_LIBRARY_EVENT, async () => {
    await openExampleLibraryWindow();
  });

  listen(INSERT_EXAMPLE_TEMPLATE_EVENT, async (event) => {
    const payload = event.payload || {};
    const nextCode = typeof payload.code === 'string' ? payload.code.trim() : '';
    if (!nextCode) return;
    insertTemplateCode(nextCode);
    await render();
  });
}

function setPngQuality(value) {
  const quality = parsePngQuality(value);
  localStorage.setItem('pngQuality', String(quality));
  if (exportPngQualityInput) {
    exportPngQualityInput.value = String(quality);
  }
  if (exportPngQualityValue) {
    exportPngQualityValue.textContent = `${quality}%`;
  }
  return quality;
}

const MERMAID_SUGGESTIONS = [
  {
    label: 'graph TD',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'Flowchart (top-down)',
    insertText: 'graph TD\n  A[Start] --> B[End]',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'graph LR',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'Flowchart (left-right)',
    insertText: 'graph LR\n  A[Start] --> B[End]',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'sequenceDiagram',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'Sequence diagram skeleton',
    insertText:
        'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'classDiagram',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'Class diagram skeleton',
    insertText:
        'classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'stateDiagram-v2',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'State diagram skeleton',
    insertText:
        'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running\n  Running --> [*]',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'erDiagram',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'ER diagram skeleton',
    insertText:
        'erDiagram\n  USER {\n    int id\n    string name\n  }\n  ORDER {\n    int id\n    int user_id\n  }\n  USER ||--o{ ORDER : places',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'gantt',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'Gantt chart skeleton',
    insertText:
        'gantt\n  title Project Timeline\n  dateFormat  YYYY-MM-DD\n  section Planning\n  Scope      :done, p1, 2026-02-01, 3d',
    insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  },
  {
    label: 'subgraph',
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: 'Create a flowchart subgraph',
    insertText: 'subgraph ',
  },
  {
    label: 'participant',
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: 'Declare sequence diagram participant',
    insertText: 'participant ',
  },
  {
    label: 'class',
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: 'Declare class',
    insertText: 'class ',
  },
  {
    label: 'style',
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: 'Apply node style',
    insertText: 'style ',
  },
  {
    label: 'linkStyle',
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: 'Apply edge style',
    insertText: 'linkStyle ',
  },
];

function initMermaidLanguage() {
  const exists = monaco.languages.getLanguages().some(
      (lang) => lang.id === MERMAID_LANGUAGE_ID);
  if (!exists) {
    monaco.languages.register({id: MERMAID_LANGUAGE_ID});
  }

  monaco.languages.setLanguageConfiguration(MERMAID_LANGUAGE_ID, {
    comments: {
      lineComment: '%%',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      {open: '{', close: '}'},
      {open: '[', close: ']'},
      {open: '(', close: ')'},
      {open: '"', close: '"'},
      {open: '\'', close: '\''},
    ],
    surroundingPairs: [
      {open: '{', close: '}'},
      {open: '[', close: ']'},
      {open: '(', close: ')'},
      {open: '"', close: '"'},
      {open: '\'', close: '\''},
    ],
  });

  monaco.languages.registerCompletionItemProvider(MERMAID_LANGUAGE_ID, {
    triggerCharacters: [' ', '-', '>', ':'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions:
            MERMAID_SUGGESTIONS.map((suggestion) => ({...suggestion, range})),
      };
    },
  });
}

function isDarkAppearance() {
  const appearance = document.documentElement.getAttribute('data-theme');
  if (appearance === 'dark') return true;
  if (appearance === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function defineMonacoThemes() {
  monaco.editor.defineTheme(MONACO_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      {token: 'comment', foreground: '8B8B96'},
    ],
    colors: {
      'editor.background': '#F7F8FA',
      'editor.foreground': '#1F2129',
      'editorLineNumber.foreground': '#A0A4AE',
      'editorLineNumber.activeForeground': '#555A67',
      'editorCursor.foreground': '#0A84FF',
      'editor.selectionBackground': '#0A84FF22',
      'editor.inactiveSelectionBackground': '#8794A422',
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.foreground': '#1F2129',
      'editorSuggestWidget.selectedBackground': '#EAF3FF',
    },
  });

  monaco.editor.defineTheme(MONACO_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      {token: 'comment', foreground: '8B94A7'},
    ],
    colors: {
      'editor.background': '#1C1E27',
      'editor.foreground': '#E9ECF4',
      'editorLineNumber.foreground': '#596076',
      'editorLineNumber.activeForeground': '#9DA7BE',
      'editorCursor.foreground': '#3E9BFF',
      'editor.selectionBackground': '#3E9BFF33',
      'editor.inactiveSelectionBackground': '#6A739233',
      'editorSuggestWidget.background': '#242838',
      'editorSuggestWidget.foreground': '#E9ECF4',
      'editorSuggestWidget.selectedBackground': '#334162',
    },
  });
}

function applyEditorTheme() {
  if (!mermaidEditor) return;
  monaco.editor.setTheme(
      isDarkAppearance() ? MONACO_THEME_DARK : MONACO_THEME_LIGHT);
}

function initEditor() {
  if (!editorContainer) return;

  initMermaidLanguage();
  defineMonacoThemes();
  const settings = getSettings();
  const editorTypography = resolveEditorTypography(settings.uiFontSize);

  mermaidEditor = monaco.editor.create(editorContainer, {
    value: EXAMPLES.flowchart,
    language: MERMAID_LANGUAGE_ID,
    automaticLayout: true,
    minimap: {enabled: false},
    scrollBeyondLastLine: false,
    fontFamily: settings.codeFont,
    fontSize: editorTypography.fontSize,
    lineHeight: editorTypography.lineHeight,
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    wordWrap: 'on',
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    snippetSuggestions: 'inline',
    bracketPairColorization: {enabled: true},
    padding: {top: 12, bottom: 12},
  });

  applyEditorTheme();
  mermaidEditor.onDidChangeModelContent(debouncedRender);
}

function getEditorCode() {
  return mermaidEditor ? mermaidEditor.getValue() : '';
}

function setEditorCode(code) {
  if (!mermaidEditor) return;
  mermaidEditor.setValue(code);
}

function insertTemplateCode(templateCode) {
  if (!mermaidEditor) return;
  const code = String(templateCode || '');
  if (!code.trim()) return;

  const model = mermaidEditor.getModel();
  if (!model) {
    setEditorCode(code);
    return;
  }

  const selection = mermaidEditor.getSelection();
  if (selection && !selection.isEmpty()) {
    mermaidEditor.executeEdits('example-library', [{
      range: selection,
      text: code,
      forceMoveMarkers: true,
    }]);
  } else {
    setEditorCode(code);
  }

  mermaidEditor.pushUndoStop();
  mermaidEditor.focus();
}

// ===== Render function =====
async function render() {
  const code = getEditorCode().trim();
  if (!code) {
    previewOutput.innerHTML = '';
    errorOverlay.classList.add('hidden');
    setStatus('ready');
    return;
  }

  setStatus('rendering');

  try {
    const settings = getSettings();
    const themeName = currentTheme;
    const colors = THEMES[themeName] || {};
    const previousRenderEngine = currentRenderEngineUsed;
    let statusState = 'ready';
    let svg = '';
    let renderedEngine = RENDER_ENGINE_BEAUTIFUL;

    if (isBeautifulEngine(settings.renderEngine)) {
      if (isUnsupportedForBeautifulMermaid(code)) {
        svg = await renderWithMermaidJs(code, colors);
        statusState = 'fallback';
        renderedEngine = RENDER_ENGINE_MERMAID_JS;
      } else {
        try {
          svg = await renderWithBeautifulMermaid(code, colors);
          renderedEngine = RENDER_ENGINE_BEAUTIFUL;
        } catch (error) {
          if (!shouldFallbackToMermaidJs(code, error)) throw error;
          svg = await renderWithMermaidJs(code, colors);
          statusState = 'fallback';
          renderedEngine = RENDER_ENGINE_MERMAID_JS;
        }
      }
    } else {
      svg = await renderWithMermaidJs(code, colors);
      renderedEngine = RENDER_ENGINE_MERMAID_JS;
    }

    if (renderedEngine === RENDER_ENGINE_MERMAID_JS &&
        previousRenderEngine !== RENDER_ENGINE_MERMAID_JS) {
      applyMermaidJsDefaultZoom(renderedEngine);
    }

    currentSvg = svg;
    currentRenderEngineUsed = renderedEngine;
    previewOutput.innerHTML = svg;

    // Sync preview pane background to the mermaid theme
    previewPane.style.backgroundColor = colors.bg || '#ffffff';

    // Add fade-in animation
    previewOutput.style.animation = 'none';
    previewOutput.offsetHeight;  // trigger reflow
    previewOutput.style.animation = '';
    syncZoomWithCurrentMode();

    errorOverlay.classList.add('hidden');
    setStatus(statusState);
  } catch (err) {
    errorMessage.textContent = err.message || 'Failed to render diagram';
    errorOverlay.classList.remove('hidden');
    setStatus('error');
  }
}

// ===== Status badge =====
function setStatus(state) {
  statusBadge.className = 'status-badge';
  switch (state) {
    case 'rendering':
      statusBadge.textContent = t('status_rendering');
      statusBadge.classList.add('rendering');
      break;
    case 'fallback':
      statusBadge.textContent = t('status_fallback');
      statusBadge.classList.add('fallback');
      break;
    case 'error':
      statusBadge.textContent = t('status_error');
      statusBadge.classList.add('error');
      break;
    default:
      statusBadge.textContent = t('status_ready');
      break;
  }
}

// ===== Debounced render =====
function debouncedRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 300);
}

// ===== Zoom Controls =====
function initZoomControls() {
  const zoomLevelEl = document.getElementById('zoom-level-input');

  function formatZoomPercent(scale) {
    const percent = Math.round(scale * 1000) / 10;
    return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
  }

  function getPreviewInnerSize() {
    const style = window.getComputedStyle(previewContainer);
    const padX =
        parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
    const padY =
        parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
    return {
      width: Math.max(1, previewContainer.clientWidth - padX),
      height: Math.max(1, previewContainer.clientHeight - padY),
    };
  }

  function getSvgDimensions(svg) {
    const viewBoxWidth = svg.viewBox?.baseVal?.width || 0;
    const viewBoxHeight = svg.viewBox?.baseVal?.height || 0;
    const width = parseFloat(svg.getAttribute('width') || '') || viewBoxWidth;
    const height = parseFloat(svg.getAttribute('height') || '') || viewBoxHeight;
    return {width, height};
  }

  function clampScroll(left, top) {
    const maxLeft = Math.max(0, previewContainer.scrollWidth - previewContainer.clientWidth);
    const maxTop = Math.max(0, previewContainer.scrollHeight - previewContainer.clientHeight);
    return {
      left: Math.max(0, Math.min(left, maxLeft)),
      top: Math.max(0, Math.min(top, maxTop)),
    };
  }

  function alignViewportCenterToDiagramCenter() {
    const svg = previewOutput.querySelector('svg');
    if (!svg) return;

    const containerRect = previewContainer.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();

    const diagramCenterX = previewContainer.scrollLeft +
      (svgRect.left - containerRect.left) + (svgRect.width / 2);
    const diagramCenterY = previewContainer.scrollTop +
      (svgRect.top - containerRect.top) + (svgRect.height / 2);

    const target = clampScroll(
        diagramCenterX - (previewContainer.clientWidth / 2),
        diagramCenterY - (previewContainer.clientHeight / 2));
    previewContainer.scrollLeft = target.left;
    previewContainer.scrollTop = target.top;
  }

  function updateZoom(animate = false) {
    previewOutput.style.transition = animate ?
      `transform ${ZOOM_ANIMATION_MS}ms var(--ease-out)` : 'none';
    previewOutput.style.transform = `scale(${zoomScale})`;
    previewOutput.style.transformOrigin = 'top center';
    if (zoomLevelEl) {
      zoomLevelEl.value = formatZoomPercent(zoomScale);
    }

    requestAnimationFrame(alignViewportCenterToDiagramCenter);
    if (zoomCenterTimer) clearTimeout(zoomCenterTimer);
    if (animate) {
      zoomCenterTimer = setTimeout(
          alignViewportCenterToDiagramCenter, ZOOM_ANIMATION_MS + 20);
    }
  }

  function setManualZoom(nextScale, animate = false) {
    zoomMode = 'manual';
    zoomScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextScale));
    updateZoom(animate);
  }

  function applyZoomMode(mode, animate = false) {
    const svg = previewOutput.querySelector('svg');
    if (!svg) return false;

    const container = getPreviewInnerSize();
    const size = getSvgDimensions(svg);
    if (!(size.width > 0) || !(size.height > 0)) return false;

    const scaleW = container.width / size.width;
    const scaleH = container.height / size.height;

    zoomMode = mode;
    zoomScale = mode === 'width' ? scaleW : Math.min(scaleW, scaleH);
    zoomScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomScale));
    updateZoom(animate);
    return true;
  }

  function parseZoomInput(value) {
    const n = parseFloat(String(value).replace('%', '').trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return n / 100;
  }

  function commitZoomInput() {
    if (!zoomLevelEl) return;
    const parsed = parseZoomInput(zoomLevelEl.value);
    if (parsed === null) {
      updateZoom(false);
      return;
    }
    setManualZoom(parsed, true);
  }

  function syncToCurrentMode() {
    if (zoomMode === 'fit') {
      applyZoomMode('fit', false);
      return;
    }
    if (zoomMode === 'width') {
      applyZoomMode('width', false);
      return;
    }
    updateZoom(false);
  }

  document.getElementById('zoom-in').addEventListener('click', () => {
    setManualZoom(zoomScale + ZOOM_STEP, true);
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    setManualZoom(zoomScale - ZOOM_STEP, true);
  });

  document.getElementById('zoom-fit').addEventListener('click', () => {
    applyZoomMode('fit', true);
  });

  document.getElementById('zoom-width').addEventListener('click', () => {
    applyZoomMode('width', true);
  });

  // Keyboard shortcuts:
  // Cmd/Ctrl+=, Cmd/Ctrl+-, Cmd/Ctrl+0 (zoom)
  // Cmd/Ctrl+, (open settings)
  // Cmd/Ctrl+Shift+E (toggle export menu)
  // Cmd/Ctrl+L (open example library)
  // Cmd/Ctrl+O (export using default format)
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === '=' || key === '+') {
      e.preventDefault();
      setManualZoom(zoomScale + ZOOM_STEP, true);
    } else if (key === '-') {
      e.preventDefault();
      setManualZoom(zoomScale - ZOOM_STEP, true);
    } else if (key === '0') {
      e.preventDefault();
      setManualZoom(1, true);
    } else if (!e.shiftKey && !e.altKey && key === 'l') {
      e.preventDefault();
      void openExampleLibraryWindow();
    } else if (!e.shiftKey && !e.altKey && key === ',') {
      e.preventDefault();
      void openSettingsWindow();
    } else if (!e.shiftKey && !e.altKey && key === 'o') {
      e.preventDefault();
      void exportAs(getDefaultExportFormat());
    } else if (e.shiftKey && key === 'e') {
      e.preventDefault();
      const willOpen = !exportMenu.classList.contains('open');
      exportMenu.classList.toggle('open', willOpen);
      if (willOpen) {
        const firstAction = exportMenu.querySelector('button');
        if (firstAction instanceof HTMLElement) firstAction.focus();
      }
    }
  });

  if (zoomLevelEl) {
    zoomLevelEl.addEventListener('blur', commitZoomInput);
    zoomLevelEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitZoomInput();
        zoomLevelEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        updateZoom(false);
        zoomLevelEl.blur();
      }
    });
  }

  const onContainerResize = () => {
    if (zoomMode === 'fit' || zoomMode === 'width') {
      syncToCurrentMode();
    }
  };
  window.addEventListener('resize', onContainerResize);

  syncZoomWithCurrentMode = syncToCurrentMode;
  syncToCurrentMode();
}

// ===== Export Menu =====
function initExportMenu() {
  setPngQuality(getSettings().pngQuality);
  updateExportMenuDefaultUi();
  updateShortcutLabels();

  if (exportPngQualityInput) {
    exportPngQualityInput.addEventListener('input', () => {
      const quality = parsePngQuality(exportPngQualityInput.value);
      if (exportPngQualityValue) {
        exportPngQualityValue.textContent = `${quality}%`;
      }
    });

    exportPngQualityInput.addEventListener('change', () => {
      setPngQuality(exportPngQualityInput.value);
    });
  }

  // Toggle dropdown
  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });

  exportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Node)) return;
    if (!exportMenu.contains(e.target) && !btnExport.contains(e.target)) {
      exportMenu.classList.remove('open');
    }
  });

  exportSvgButton?.addEventListener('click', () => exportAs('svg'));
  exportPngButton?.addEventListener('click', () => exportAs('png'));
  exportPdfButton?.addEventListener('click', () => exportAs('pdf'));
}

async function exportAs(format) {
  exportMenu.classList.remove('open');
  if (!currentSvg) return;

  try {
    if (format === 'svg') {
      const filePath = await save({
        title: t('save_svg'),
        defaultPath: 'mermaid-diagram.svg',
        filters: [{name: 'SVG', extensions: ['svg']}],
      });
      if (filePath) {
        const exportSvg = currentRenderEngineUsed === RENDER_ENGINE_MERMAID_JS ?
          await buildMermaidJsExportSvg(getDiagramFont()) :
          currentSvg;
        await writeTextFile(filePath, exportSvg);
      }
    } else if (format === 'png') {
      const quality = setPngQuality(
          exportPngQualityInput ? exportPngQualityInput.value :
                                  getSettings().pngQuality);
      const scale = pngQualityToScale(quality);
      const diagramFont = getDiagramFont();
      const preferredFontFamily = await resolvePdfPreferredFontFamily(diagramFont);
      const exportSvg = await buildPortableSvgForExport(diagramFont);
      let pngBytes;
      try {
        const pngRaw = await invoke('svg_to_png', {
          svg: exportSvg,
          options: {
            rasterScale: scale,
            preferredFontFamily,
          },
        });
        pngBytes = normalizeBinaryBytes(pngRaw);
      } catch (backendError) {
        console.warn(
            'Backend PNG rasterization failed. Falling back to browser rasterization.',
            backendError,
        );
        const canvas = await rasterizeSvg(exportSvg, scale);
        const dataUrl = canvas.toDataURL('image/png');
        pngBytes = dataUrlToBytes(dataUrl);
      }
      const filePath = await save({
        title: t('save_png'),
        defaultPath: 'mermaid-diagram.png',
        filters: [{name: 'PNG', extensions: ['png']}],
      });
      if (filePath) {
        await writeFile(filePath, pngBytes);
      }
    } else if (format === 'pdf') {
      const filePath = await save({
        title: t('save_pdf'),
        defaultPath: 'mermaid-diagram.pdf',
        filters: [{name: 'PDF', extensions: ['pdf']}],
      });
      if (filePath) {
        const diagramFont = getDiagramFont();
        const preferredFontFamily = await resolvePdfPreferredFontFamily(diagramFont);
        const exportSvg = await buildPortableSvgForExport(diagramFont);
        const pageBackgroundRgb = resolveThemeBackgroundRgb();
        const pdfRaw = await invoke('svg_to_pdf', {
          svg: exportSvg,
          options: {
            rasterScale: DEFAULT_PDF_RASTER_SCALE,
            dpi: DEFAULT_PDF_DPI,
            preferredFontFamily,
            pageBackgroundRgb,
          },
        });
        const pdfBytes = normalizeBinaryBytes(pdfRaw);
        await writeFile(filePath, pdfBytes);
      }
    }
  } catch (err) {
    console.error('Export error:', err);
  }
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function buildPortableSvgForExport(defaultFontStack = DEFAULT_DIAGRAM_FONT) {
  if (!currentSvg) return currentSvg;
  if (currentRenderEngineUsed === RENDER_ENGINE_MERMAID_JS) {
    return await buildMermaidJsExportSvg(defaultFontStack);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(currentSvg, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || String(svg.tagName).toLowerCase() !== 'svg') return currentSvg;

  const cssVars = buildPdfCssVars(svg);
  inlineResolvedSvgStyles(svg, cssVars, defaultFontStack);
  svg.querySelectorAll('style').forEach((el) => el.remove());
  svg.removeAttribute('style');
  insertResolvedBackground(doc, svg, cssVars['--bg']);
  return new XMLSerializer().serializeToString(svg);
}

async function buildMermaidJsExportSvg(defaultFontStack = DEFAULT_DIAGRAM_FONT) {
  if (!currentSvg) return currentSvg;
  const sourceSvg = await renderMermaidJsPortableSvgForExport();
  const parser = new DOMParser();
  const doc = parser.parseFromString(sourceSvg, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || String(svg.tagName).toLowerCase() !== 'svg') return sourceSvg;

  // Inline font attributes for rasterizers that may not fully honor CSS cascade
  // when SVG is rendered via <img src="blob:...">.
  const textElements = svg.querySelectorAll('text, tspan');
  textElements.forEach((el) => {
    el.setAttribute('font-family', defaultFontStack);
  });

  const foreignObjectElements = svg.querySelectorAll('foreignObject *');
  foreignObjectElements.forEach((el) => {
    if (!(el instanceof Element)) return;
    const existingStyle = String(el.getAttribute('style') || '').trim();
    const nextStyle =
        `${existingStyle ? `${existingStyle}; ` : ''}font-family: ${defaultFontStack};`;
    el.setAttribute('style', nextStyle);
  });

  const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
text, tspan {
  font-family: ${defaultFontStack} !important;
}
foreignObject, foreignObject * {
  font-family: ${defaultFontStack} !important;
}
code, pre {
  font-family: ${PDF_MONO_FONT_STACK} !important;
}
`;
  svg.appendChild(styleEl);
  return new XMLSerializer().serializeToString(svg);
}

async function renderMermaidJsPortableSvgForExport() {
  const code = getEditorCode().trim();
  if (!code) return currentSvg;
  const colors = THEMES[currentTheme] || {};
  try {
    return await renderWithMermaidJs(code, colors, {htmlLabels: false});
  } catch (error) {
    console.warn(
        'Failed to re-render mermaid-js diagram for portable export. Falling back to preview SVG.',
        error,
    );
    return currentSvg;
  }
}

function buildPdfCssVars(svg) {
  const vars = {};
  const rootStyle = parseStyleDeclarations(svg.getAttribute('style') || '');
  for (const [prop, value] of Object.entries(rootStyle)) {
    if (prop.startsWith('--')) {
      vars[prop] = value;
    }
  }

  const bg = resolveColorValue(vars['--bg'] || '#ffffff', vars) || '#ffffff';
  const fg = resolveColorValue(vars['--fg'] || '#27272A', vars) || '#27272A';

  vars['--bg'] = bg;
  vars['--fg'] = fg;
  vars['--line'] = resolveColorValue(vars['--line'] || mixColors(fg, bg, 30), vars);
  vars['--accent'] =
      resolveColorValue(vars['--accent'] || mixColors(fg, bg, 50), vars);
  vars['--muted'] = resolveColorValue(vars['--muted'] || mixColors(fg, bg, 40), vars);
  vars['--surface'] =
      resolveColorValue(vars['--surface'] || mixColors(fg, bg, 3), vars);
  vars['--border'] = resolveColorValue(vars['--border'] || mixColors(fg, bg, 20), vars);

  vars['--_text'] = fg;
  vars['--_text-sec'] = vars['--muted'] || mixColors(fg, bg, 60);
  vars['--_text-muted'] = vars['--muted'] || mixColors(fg, bg, 40);
  vars['--_text-faint'] = mixColors(fg, bg, 25);
  vars['--_line'] = vars['--line'] || mixColors(fg, bg, 30);
  vars['--_arrow'] = vars['--accent'] || mixColors(fg, bg, 50);
  vars['--_node-fill'] = vars['--surface'] || mixColors(fg, bg, 3);
  vars['--_node-stroke'] = vars['--border'] || mixColors(fg, bg, 20);
  vars['--_group-fill'] = bg;
  vars['--_group-hdr'] = mixColors(fg, bg, 5);
  vars['--_inner-stroke'] = mixColors(fg, bg, 12);
  vars['--_key-badge'] = mixColors(fg, bg, 10);

  return vars;
}

function inlineResolvedSvgStyles(svg, cssVars, defaultFontStack) {
  const elements = [svg, ...svg.querySelectorAll('*')];
  for (const el of elements) {
    if (!(el instanceof Element)) continue;
    if (String(el.tagName).toLowerCase() === 'style') continue;

    const originalClass = el.getAttribute('class') || '';
    const inlineStyles = parseStyleDeclarations(el.getAttribute('style') || '');
    el.removeAttribute('class');
    el.removeAttribute('style');

    for (const prop of SVG_EXPORT_STYLE_PROPS) {
      const attrValue = el.getAttribute(prop);
      const rawValue = inlineStyles[prop] ?? attrValue;
      if (!rawValue) continue;

      let resolved = resolveCssVariables(rawValue, cssVars);
      if (SVG_COLOR_PROPS.has(prop)) {
        resolved = resolveColorValue(resolved, cssVars);
      }
      if (!resolved) continue;
      el.setAttribute(prop, resolved);
    }

    if (String(el.tagName).toLowerCase() === 'text' && !el.getAttribute('fill')) {
      el.setAttribute('fill', cssVars['--_text'] || cssVars['--fg'] || '#111111');
    }

    if (String(el.tagName).toLowerCase() === 'text' &&
        !el.getAttribute('font-family')) {
      const fallbackStack = /\bmono\b/.test(originalClass) ?
        PDF_MONO_FONT_STACK :
        defaultFontStack;
      el.setAttribute('font-family', fallbackStack);
    }
  }
}

async function resolvePdfPreferredFontFamily(fontStack) {
  const candidates = parseFontFamilyStack(fontStack);
  if (candidates.length === 0) return 'Helvetica';
  try {
    const rawSystemFonts = await invoke('list_system_fonts');
    if (Array.isArray(rawSystemFonts)) {
      const systemMap = new Map(
          rawSystemFonts
              .filter(Boolean)
              .map((name) => [String(name).toLowerCase(), String(name)]),
      );
      for (const family of candidates) {
        const hit = systemMap.get(family.toLowerCase());
        if (hit) return hit;
      }
    }
  } catch (_) {
    // Fallback to the first declared family if the system font lookup fails.
  }
  return candidates[0];
}

function parseFontFamilyStack(fontStack) {
  return String(fontStack || '')
      .split(',')
      .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
      .filter((name) => name && !/^(sans-serif|serif|monospace|system-ui)$/i.test(name));
}

function resolveThemeBackgroundRgb() {
  const theme = THEMES[currentTheme] || {};
  const candidate = theme.bg || '#ffffff';
  const rgb = parseCssColorToRgb(candidate);
  if (rgb) return [rgb.r, rgb.g, rgb.b];
  return [255, 255, 255];
}

function parseStyleDeclarations(styleText) {
  const map = {};
  const chunks = String(styleText || '').split(';');
  for (const chunk of chunks) {
    const idx = chunk.indexOf(':');
    if (idx <= 0) continue;
    const prop = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    if (!prop || !value) continue;
    map[prop] = value;
  }
  return map;
}

function resolveCssVariables(value, vars) {
  let result = String(value || '').trim();
  for (let i = 0; i < 8; i++) {
    const next = result.replace(
        /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g,
        (_, name, fallback) => vars[name] || (fallback ? fallback.trim() : ''),
    );
    if (next === result) break;
    result = next;
  }
  return result.trim();
}

function resolveColorValue(value, vars) {
  if (!value || value === 'none') return value;
  let result = resolveCssVariables(value, vars);
  result = resolveColorMixFunctions(result);
  return canonicalizeCssColor(result) || result;
}

function resolveColorMixFunctions(value) {
  let result = String(value || '').trim();
  for (let i = 0; i < 6; i++) {
    const next = result.replace(
        /color-mix\(\s*in\s+srgb\s*,\s*([^,]+?)\s+([0-9.]+)%\s*,\s*([^)]+?)\s*\)/gi,
        (_, c1, p1, c2) => mixColors(String(c1).trim(), String(c2).trim(), Number(p1)),
    );
    if (next === result) break;
    result = next;
  }
  return result;
}

function parseCssColorToRgb(value) {
  const canonical = canonicalizeCssColor(value);
  if (!canonical) return null;
  const m = canonical.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(',').map((n) => Number(n.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return {r: parts[0], g: parts[1], b: parts[2]};
}

function rgbToHex({r, g, b}) {
  const toByte = (n) =>
    Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
  return `#${toByte(r).toString(16).padStart(2, '0')}${
    toByte(g).toString(16).padStart(2, '0')}${
    toByte(b).toString(16).padStart(2, '0')}`;
}

function toMermaidHex(value, fallback = '#000000') {
  const rgb = parseCssColorToRgb(value);
  if (rgb) return rgbToHex(rgb);
  const fallbackRgb = parseCssColorToRgb(fallback);
  if (fallbackRgb) return rgbToHex(fallbackRgb);
  return '#000000';
}

function mixColors(colorA, colorB, weightA) {
  const a = parseCssColorToRgb(colorA);
  const b = parseCssColorToRgb(colorB);
  if (!a || !b) return colorA;
  const t = Math.max(0, Math.min(100, Number(weightA))) / 100;
  const r = Math.round(a.r * t + b.r * (1 - t));
  const g = Math.round(a.g * t + b.g * (1 - t));
  const bMix = Math.round(a.b * t + b.b * (1 - t));
  return `rgb(${r}, ${g}, ${bMix})`;
}

function canonicalizeCssColor(value) {
  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = String(value || '').trim();
  if (!probe.style.color) return null;
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.top = '-9999px';
  document.body.appendChild(probe);
  const canonical = window.getComputedStyle(probe).color.trim();
  probe.remove();
  return canonical || null;
}

function insertResolvedBackground(doc, svg, backgroundColor) {
  if (!backgroundColor ||
      backgroundColor === 'transparent' ||
      backgroundColor === 'rgba(0, 0, 0, 0)') {
    return;
  }

  const bgRect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', backgroundColor);
  svg.insertBefore(bgRect, svg.firstChild);
}

function normalizeBinaryBytes(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (Array.isArray(input)) {
    return Uint8Array.from(input);
  }
  if (typeof input === 'string') {
    const values = input.split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 255);
    if (values.length > 0) {
      return Uint8Array.from(values);
    }
  }
  throw new Error('Unexpected binary payload for PDF export');
}

function pngQualityToScale(quality) {
  // PNG quality is mapped to raster scale because PNG has lossless encoding.
  const clamped = parsePngQuality(quality);
  const normalized = (clamped - 10) / 90;
  return Number((1 + normalized * 3).toFixed(2));
}

// SVG -> Canvas (for raster export)
function rasterizeSvg(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to create canvas context'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterize SVG'));
    };
    img.src = url;
  });
}

// ===== Resize handle =====
function initResize() {
  const handle = document.getElementById('resize-handle');
  const editorPane = document.getElementById('editor-pane');
  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const appRect = document.getElementById('app').getBoundingClientRect();
    const newWidth = e.clientX - appRect.left;
    const minW = 280;
    const maxW = appRect.width - 300;
    const clamped = Math.max(minW, Math.min(maxW, newWidth));
    editorPane.style.flex = `0 0 ${clamped}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ===== Example Library Window =====
function initExampleLibraryButton() {
  if (!btnExamples) return;

  btnExamples.addEventListener('click', async (e) => {
    e.stopPropagation();
    await openExampleLibraryWindow();
  });
}

// ===== Appearance (Light / Dark / System) =====
function initAppearance() {
  const switcher = document.getElementById('appearance-switcher');
  if (!switcher) {
    const saved = localStorage.getItem('appearance') || DEFAULT_APPEARANCE;
    applyAppearance(saved);
    return;
  }

  const buttons = switcher.querySelectorAll('button[data-appearance]');
  const saved = localStorage.getItem('appearance') || DEFAULT_APPEARANCE;
  applyAppearance(saved);

  // Bind click events on segmented control
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.appearance;
      localStorage.setItem('appearance', mode);
      applyAppearance(mode);
    });
  });

  // Listen for system theme changes (for "system" mode)
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    const current = localStorage.getItem('appearance') || DEFAULT_APPEARANCE;
    if (current === DEFAULT_APPEARANCE) {
      applyAppearance(DEFAULT_APPEARANCE);
    }
  });
}

function applyAppearance(mode) {
  const root = document.documentElement;
  const switcher = document.getElementById('appearance-switcher');
  const buttons =
      switcher ? switcher.querySelectorAll('button[data-appearance]') : [];
  buttons.forEach(
      (b) => b.classList.toggle('active', b.dataset.appearance === mode));

  // Set data-theme on root element
  if (mode === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (mode === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    // System mode — let CSS @media query handle it
    root.setAttribute('data-theme', 'system');
  }

  applyEditorTheme();
}

// ===== Window Dragging (titlebar fallback) =====
function initWindowDragging() {
  if (!toolbar) return;

  const appWindow = getCurrentWindow();
  const NON_DRAGGABLE_SELECTOR =
      'button, select, input, textarea, a, [contenteditable="true"]';

  toolbar.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    // Keep native behavior for controls inside the toolbar.
    if (target.closest(NON_DRAGGABLE_SELECTOR)) return;
    if (!target.closest('[data-tauri-drag-region]')) return;

    try {
      await appWindow.startDragging();
    } catch (_) {
      // Ignore: native drag region may already handle this on some platforms.
    }
  });
}

// ===== Initialize =====
function init() {
  const settings = getSettings();
  currentTheme = resolveStartupChartTheme(settings);
  applyUiFont(settings.uiFont);
  applyUiFontSize(settings.uiFontSize);
  initWindowDragging();
  initAppearance();
  initSettingsWindow();
  initThemes();
  initThemePopup();
  initEditor();
  applyCodeFont(settings.codeFont);
  initResize();
  initZoomControls();
  applyMermaidJsDefaultZoom(settings.renderEngine);
  initExportMenu();
  initExampleLibraryEvents();
  initExampleLibraryButton();

  // Initial render
  render();

  // Apply i18n to all data-i18n elements
  applyI18n(document);
  updateShortcutLabels();
  updateExportMenuDefaultUi();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
