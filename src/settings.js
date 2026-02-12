import {invoke} from '@tauri-apps/api/core';
import {emit} from '@tauri-apps/api/event';
import {THEMES} from 'beautiful-mermaid';

import {installAntiInspect} from './anti-inspect.js';
import {applyI18n, getLocale, setLocale, t} from './i18n.js';

// ===== Constants =====
installAntiInspect();

const DEFAULT_UI_FONT =
    '-apple-system, BlinkMacSystemFont, \'SF Pro Text\', \'Helvetica Neue\', sans-serif';
const DEFAULT_CODE_FONT =
    '\'SF Mono\', \'JetBrains Mono\', Menlo, Monaco, monospace';
const DEFAULT_CHART_FONT = DEFAULT_UI_FONT;
const DEFAULT_UI_FONT_SIZE = 14;
const MIN_UI_FONT_SIZE = 12;
const MAX_UI_FONT_SIZE = 24;
const DEFAULT_PNG_QUALITY = 85;
const DEFAULT_EXPORT_FORMAT = 'svg';
const SETTINGS_EVENT = 'settings-updated';
const SETTINGS_ACTIVE_PAGE_KEY = 'settings-active-page';
const TEMPLATE_LIBRARY_STORAGE_KEY = 'example-library-templates-v1';
const RENDER_ENGINE_BEAUTIFUL = 'bautiful-mermaid';
const RENDER_ENGINE_BEAUTIFUL_LEGACY = 'beautiful-mermaid';
const RENDER_ENGINE_MERMAID_JS = 'mermaid-js/mermaid';
const DEFAULT_RENDER_ENGINE = RENDER_ENGINE_BEAUTIFUL;
const EXPORT_FORMATS = new Set(['svg', 'png', 'pdf']);
const DEFAULT_SETTINGS_PAGE = 'general';
const DEFAULT_APPEARANCE = 'system';
const DEFAULT_LIGHT_CHART_THEME = 'github-light';
const DEFAULT_DARK_CHART_THEME = 'github-dark';
const FALLBACK_SYSTEM_FONTS = [
  'Arial',
  'Courier New',
  'Georgia',
  'Helvetica Neue',
  'Inter',
  'Menlo',
  'Monaco',
  'SF Pro',
  'Times New Roman',
  'Verdana',
];

// ===== DOM Refs =====
const settingsNavItems = [...document.querySelectorAll('.settings-nav-item')];
const settingsPanels = [...document.querySelectorAll('.settings-panel')];
const languageSelect = document.getElementById('language-select');
const appearanceSelect = document.getElementById('appearance-select');
const uiFontSizeInput = document.getElementById('ui-font-size');
const resetTemplateLibraryButton = document.getElementById('btn-reset-template-library');
const renderEngineSelect = document.getElementById('render-engine-select');
const defaultLightChartThemeSelect = document.getElementById(
    'default-light-chart-theme-select');
const defaultDarkChartThemeSelect = document.getElementById(
    'default-dark-chart-theme-select');
const pngQualityInput = document.getElementById('png-quality');
const pngQualityValue = document.getElementById('png-quality-value');
const exportDefaultFormatSelect = document.getElementById('export-default-format');

const fontFields = [
  {
    key: 'uiFont',
    input: document.getElementById('ui-font-input'),
    suggestions: document.getElementById('ui-font-suggestions'),
    preview: null,
    highlightIndex: -1,
  },
  {
    key: 'codeFont',
    input: document.getElementById('code-font-input'),
    suggestions: document.getElementById('code-font-suggestions'),
    preview: null,
    highlightIndex: -1,
  },
  {
    key: 'chartFont',
    input: document.getElementById('chart-font-input'),
    suggestions: document.getElementById('chart-font-suggestions'),
    preview: document.getElementById('chart-font-preview'),
    highlightIndex: -1,
  },
].filter((field) => field.input && field.suggestions);

// ===== State =====
let systemFonts = [...FALLBACK_SYSTEM_FONTS];
let systemAppearanceMedia = null;
let systemFontsPromise = null;

// ===== Helpers =====
function parsePngQuality(raw) {
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.min(100, Math.max(10, Math.round(n)));
  return DEFAULT_PNG_QUALITY;
}

function parseUiFontSize(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_UI_FONT_SIZE;
  return Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(n)));
}

function normalizeFontValue(rawValue, fallback) {
  const value = String(rawValue || '').trim();
  return value || fallback;
}

function resolveChartFontFromStorage() {
  const chart = normalizeFontValue(localStorage.getItem('chartFont'), '');
  if (chart) return chart;

  const customLegacy = normalizeFontValue(localStorage.getItem('customDiagramFont'), '');
  if (customLegacy) return customLegacy;

  const legacy = normalizeFontValue(localStorage.getItem('diagramFont'), '');
  if (legacy && legacy !== '__custom__') return legacy;

  return DEFAULT_CHART_FONT;
}

function getSettings() {
  return {
    locale: getLocale(),
    appearance: normalizeAppearance(localStorage.getItem('appearance')),
    renderEngine: normalizeRenderEngine(localStorage.getItem('renderEngine')),
    uiFont: normalizeFontValue(localStorage.getItem('uiFont'), DEFAULT_UI_FONT),
    uiFontSize: parseUiFontSize(localStorage.getItem('uiFontSize')),
    codeFont: normalizeFontValue(localStorage.getItem('codeFont'), DEFAULT_CODE_FONT),
    chartFont: resolveChartFontFromStorage(),
    defaultLightChartTheme: normalizeChartThemeName(
        localStorage.getItem('defaultLightChartTheme'),
        DEFAULT_LIGHT_CHART_THEME),
    defaultDarkChartTheme: normalizeChartThemeName(
        localStorage.getItem('defaultDarkChartTheme'),
        DEFAULT_DARK_CHART_THEME),
    pngQuality: parsePngQuality(localStorage.getItem('pngQuality')),
    exportDefaultFormat: normalizeExportFormat(
        localStorage.getItem('exportDefaultFormat')),
  };
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

function normalizeExportFormat(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  return EXPORT_FORMATS.has(value) ? value : DEFAULT_EXPORT_FORMAT;
}

function normalizeAppearance(rawValue) {
  const value = String(rawValue || DEFAULT_APPEARANCE).trim().toLowerCase();
  return ['system', 'light', 'dark'].includes(value) ?
    value :
    DEFAULT_APPEARANCE;
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

function applyAppearance(mode) {
  const root = document.documentElement;
  const nextMode = normalizeAppearance(mode);
  if (nextMode === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (nextMode === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.setAttribute('data-theme', 'system');
  }
}

function initAppearanceSync() {
  applyAppearance(localStorage.getItem('appearance'));

  if (systemAppearanceMedia) return;
  systemAppearanceMedia = window.matchMedia('(prefers-color-scheme: dark)');
  systemAppearanceMedia.addEventListener('change', () => {
    const currentMode = normalizeAppearance(localStorage.getItem('appearance'));
    if (currentMode === DEFAULT_APPEARANCE) {
      applyAppearance(currentMode);
    }
  });
}

function applyUiFontToWindow(fontFamily) {
  const value = normalizeFontValue(fontFamily, DEFAULT_UI_FONT);
  document.documentElement.style.setProperty('--app-ui-font', value);
}

function applyUiFontSizeToWindow(size) {
  const value = parseUiFontSize(size);
  document.documentElement.style.setProperty('--app-ui-font-size', `${value}px`);
}

function saveSettings(settings) {
  setLocale(settings.locale);
  localStorage.setItem('appearance', normalizeAppearance(settings.appearance));
  localStorage.setItem('renderEngine', normalizeRenderEngine(settings.renderEngine));
  localStorage.setItem('uiFont', normalizeFontValue(settings.uiFont, DEFAULT_UI_FONT));
  localStorage.setItem('uiFontSize', String(parseUiFontSize(settings.uiFontSize)));
  localStorage.setItem('codeFont', normalizeFontValue(settings.codeFont, DEFAULT_CODE_FONT));

  const chartFont = normalizeFontValue(settings.chartFont, DEFAULT_CHART_FONT);
  localStorage.setItem('chartFont', chartFont);
  // Keep legacy keys for backward compatibility with older builds.
  localStorage.setItem('diagramFont', '__custom__');
  localStorage.setItem('customDiagramFont', chartFont);

  localStorage.setItem('pngQuality', String(settings.pngQuality));
  localStorage.setItem(
      'defaultLightChartTheme',
      normalizeChartThemeName(
          settings.defaultLightChartTheme,
          DEFAULT_LIGHT_CHART_THEME));
  localStorage.setItem(
      'defaultDarkChartTheme',
      normalizeChartThemeName(
          settings.defaultDarkChartTheme,
          DEFAULT_DARK_CHART_THEME));
  localStorage.setItem(
      'exportDefaultFormat', normalizeExportFormat(settings.exportDefaultFormat));
}

async function publishSettings(settings) {
  saveSettings(settings);
  await emit(SETTINGS_EVENT, settings);
}

function resolveSettingsPage(rawPage) {
  const page = String(rawPage || '').trim();
  if (!page) return DEFAULT_SETTINGS_PAGE;
  const exists = settingsPanels.some((panel) => panel.dataset.page === page);
  return exists ? page : DEFAULT_SETTINGS_PAGE;
}

function activateSettingsPage(pageId) {
  const nextPage = resolveSettingsPage(pageId);

  settingsNavItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.pageTarget === nextPage);
  });

  settingsPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.page === nextPage);
  });

  localStorage.setItem(SETTINGS_ACTIVE_PAGE_KEY, nextPage);
}

function initSettingsNavigation() {
  const savedPage = localStorage.getItem(SETTINGS_ACTIVE_PAGE_KEY);
  activateSettingsPage(savedPage || DEFAULT_SETTINGS_PAGE);

  settingsNavItems.forEach((item) => {
    item.addEventListener('click', () => {
      activateSettingsPage(item.dataset.pageTarget);
    });
  });
}

// ===== System Font Loading =====
async function loadSystemFonts() {
  if (systemFontsPromise) return systemFontsPromise;

  systemFontsPromise = invoke('list_system_fonts')
      .then((fonts) => {
        const parsed = Array.isArray(fonts) ? fonts : [];
        const cleaned = parsed
            .map((font) => String(font || '').trim())
            .filter(Boolean);
        if (cleaned.length > 0) {
          systemFonts = cleaned;
        }
        return systemFonts;
      })
      .catch((err) => {
        console.warn('Failed to load system fonts, using fallback', err);
        return systemFonts;
      });

  return systemFontsPromise;
}

// ===== Font Autocomplete =====
function filterFonts(query) {
  if (!query.trim()) return systemFonts.slice(0, 80);
  const lower = query.toLowerCase();
  const prefix = [];
  const contains = [];
  for (const font of systemFonts) {
    const fl = font.toLowerCase();
    if (fl.startsWith(lower)) {
      prefix.push(font);
    } else if (fl.includes(lower)) {
      contains.push(font);
    }
  }
  return [...prefix, ...contains].slice(0, 80);
}

function hideSuggestions(field) {
  field.suggestions.classList.remove('open');
  field.highlightIndex = -1;
}

function hideAllSuggestions(exceptKey = '') {
  for (const field of fontFields) {
    if (field.key === exceptKey) continue;
    hideSuggestions(field);
  }
}

function renderSuggestions(field, fonts, currentFont) {
  field.suggestions.innerHTML = '';
  field.highlightIndex = -1;

  if (fonts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'font-suggestion-empty';
    empty.textContent = t('no_fonts_found');
    field.suggestions.appendChild(empty);
    return;
  }

  fonts.forEach((font, index) => {
    const btn = document.createElement('button');
    btn.className = 'font-suggestion-item';
    if (font === currentFont) btn.classList.add('selected');
    btn.textContent = font;
    btn.style.fontFamily = font;
    btn.dataset.index = String(index);

    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      void selectFont(field, font);
    });

    field.suggestions.appendChild(btn);
  });
}

function renderSuggestionsForField(field) {
  const settings = getSettings();
  const filtered = filterFonts(field.input.value);
  const currentFont = normalizeFontValue(settings[field.key], '');
  renderSuggestions(field, filtered, currentFont);
}

function refreshSuggestionsIfOpen(field) {
  if (!field.suggestions.classList.contains('open')) return;
  renderSuggestionsForField(field);
}

function showSuggestions(field) {
  hideAllSuggestions(field.key);
  renderSuggestionsForField(field);
  field.suggestions.classList.add('open');

  void loadSystemFonts().then(() => {
    refreshSuggestionsIfOpen(field);
  });
}

function scheduleSystemFontWarmup() {
  const warmup = () => {
    void loadSystemFonts();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warmup, {timeout: 1200});
    return;
  }
  window.setTimeout(warmup, 0);
}

function highlightItem(field, index) {
  const items = field.suggestions.querySelectorAll('.font-suggestion-item');
  items.forEach((item) => item.classList.remove('highlighted'));
  if (index >= 0 && index < items.length) {
    items[index].classList.add('highlighted');
    items[index].scrollIntoView({block: 'nearest'});
  }
  field.highlightIndex = index;
}

function syncFontField(field, settings) {
  const value = normalizeFontValue(settings[field.key], '');
  field.input.value = value;
  if (field.preview) {
    field.preview.style.fontFamily = value;
  }
}

async function selectFont(field, fontName) {
  const settings = getSettings();
  settings[field.key] = normalizeFontValue(fontName, settings[field.key]);
  syncFontField(field, settings);
  hideSuggestions(field);
  await publishSettings(settings);
}

function bindFontField(field) {
  field.input.addEventListener('focus', () => {
    showSuggestions(field);
  });

  field.input.addEventListener('input', () => {
    showSuggestions(field);
  });

  field.input.addEventListener('blur', () => {
    setTimeout(() => hideSuggestions(field), 150);
  });

  field.input.addEventListener('keydown', (event) => {
    const items = field.suggestions.querySelectorAll('.font-suggestion-item');
    const count = items.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightItem(
          field,
          field.highlightIndex < count - 1 ? field.highlightIndex + 1 : 0,
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightItem(
          field,
          field.highlightIndex > 0 ? field.highlightIndex - 1 : count - 1,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (field.highlightIndex >= 0 && field.highlightIndex < count) {
        void selectFont(field, items[field.highlightIndex].textContent);
      } else if (field.input.value.trim()) {
        void selectFont(field, field.input.value.trim());
      }
    } else if (event.key === 'Escape') {
      hideSuggestions(field);
      field.input.blur();
    }
  });
}

function syncLanguage(settings) {
  if (!languageSelect) return;
  languageSelect.value = settings.locale === 'en' ? 'en' : 'zh';
}

function syncAppearance(settings) {
  if (!appearanceSelect) return;
  appearanceSelect.value = normalizeAppearance(settings.appearance);
}

function syncRenderEngine(settings) {
  if (!renderEngineSelect) return;
  renderEngineSelect.value = normalizeRenderEngine(settings.renderEngine);
}

function formatThemeName(name) {
  return String(name || '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
}

function initDefaultChartThemeOptions() {
  const selects = [defaultLightChartThemeSelect, defaultDarkChartThemeSelect]
      .filter(Boolean);
  if (selects.length === 0) return;

  const themeNames = Object.keys(THEMES);
  selects.forEach((select) => {
    select.innerHTML = '';
    themeNames.forEach((themeName) => {
      const option = document.createElement('option');
      option.value = themeName;
      option.textContent = formatThemeName(themeName);
      select.appendChild(option);
    });
  });
}

function syncDefaultChartThemes(settings) {
  if (defaultLightChartThemeSelect) {
    defaultLightChartThemeSelect.value = normalizeChartThemeName(
        settings.defaultLightChartTheme,
        DEFAULT_LIGHT_CHART_THEME);
  }
  if (defaultDarkChartThemeSelect) {
    defaultDarkChartThemeSelect.value = normalizeChartThemeName(
        settings.defaultDarkChartTheme,
        DEFAULT_DARK_CHART_THEME);
  }
}

// ===== UI Sync =====
function syncUi(settings) {
  syncLanguage(settings);
  syncAppearance(settings);
  syncRenderEngine(settings);
  syncDefaultChartThemes(settings);
  applyAppearance(settings.appearance);
  applyUiFontToWindow(settings.uiFont);
  applyUiFontSizeToWindow(settings.uiFontSize);

  for (const field of fontFields) {
    syncFontField(field, settings);
  }

  if (uiFontSizeInput) {
    uiFontSizeInput.value = String(parseUiFontSize(settings.uiFontSize));
  }

  if (pngQualityInput && pngQualityValue) {
    pngQualityInput.value = String(settings.pngQuality);
    pngQualityValue.textContent = `${settings.pngQuality}%`;
  }

  if (exportDefaultFormatSelect) {
    exportDefaultFormatSelect.value =
        normalizeExportFormat(settings.exportDefaultFormat);
  }

  applyI18n(document);
}

// ===== Init =====
async function init() {
  initDefaultChartThemeOptions();
  const settings = getSettings();
  initAppearanceSync();
  syncUi(settings);
  initSettingsNavigation();
  scheduleSystemFontWarmup();

  if (languageSelect) {
    languageSelect.addEventListener('change', async () => {
      const next = getSettings();
      next.locale = languageSelect.value === 'en' ? 'en' : 'zh';
      setLocale(next.locale);
      syncLanguage(next);
      applyI18n(document);
      await publishSettings(next);
    });
  }

  if (appearanceSelect) {
    appearanceSelect.addEventListener('change', async () => {
      const next = getSettings();
      next.appearance = normalizeAppearance(appearanceSelect.value);
      syncAppearance(next);
      applyAppearance(next.appearance);
      await publishSettings(next);
    });
  }

  if (uiFontSizeInput) {
    const commitUiFontSize = async () => {
      const nextSize = parseUiFontSize(uiFontSizeInput.value);
      uiFontSizeInput.value = String(nextSize);
      const current = parseUiFontSize(localStorage.getItem('uiFontSize'));
      if (current === nextSize) return;
      const next = getSettings();
      next.uiFontSize = nextSize;
      await publishSettings(next);
    };

    uiFontSizeInput.addEventListener('input', () => {
      const nextSize = parseUiFontSize(uiFontSizeInput.value);
      applyUiFontSizeToWindow(nextSize);
    });

    uiFontSizeInput.addEventListener('change', async () => {
      await commitUiFontSize();
    });

    uiFontSizeInput.addEventListener('blur', async () => {
      await commitUiFontSize();
    });

    uiFontSizeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        uiFontSizeInput.blur();
      }
    });
  }

  if (renderEngineSelect) {
    renderEngineSelect.addEventListener('change', async () => {
      const next = getSettings();
      next.renderEngine = normalizeRenderEngine(renderEngineSelect.value);
      syncRenderEngine(next);
      await publishSettings(next);
    });
  }

  if (defaultLightChartThemeSelect) {
    defaultLightChartThemeSelect.addEventListener('change', async () => {
      const next = getSettings();
      next.defaultLightChartTheme = normalizeChartThemeName(
          defaultLightChartThemeSelect.value,
          DEFAULT_LIGHT_CHART_THEME);
      syncDefaultChartThemes(next);
      await publishSettings(next);
    });
  }

  if (defaultDarkChartThemeSelect) {
    defaultDarkChartThemeSelect.addEventListener('change', async () => {
      const next = getSettings();
      next.defaultDarkChartTheme = normalizeChartThemeName(
          defaultDarkChartThemeSelect.value,
          DEFAULT_DARK_CHART_THEME);
      syncDefaultChartThemes(next);
      await publishSettings(next);
    });
  }

  for (const field of fontFields) {
    bindFontField(field);
  }

  if (pngQualityInput && pngQualityValue) {
    pngQualityInput.addEventListener('input', () => {
      pngQualityValue.textContent = `${parsePngQuality(pngQualityInput.value)}%`;
    });

    pngQualityInput.addEventListener('change', async () => {
      const next = getSettings();
      next.pngQuality = parsePngQuality(pngQualityInput.value);
      await publishSettings(next);
    });
  }

  if (exportDefaultFormatSelect) {
    exportDefaultFormatSelect.addEventListener('change', async () => {
      const next = getSettings();
      next.exportDefaultFormat =
          normalizeExportFormat(exportDefaultFormatSelect.value);
      await publishSettings(next);
    });
  }

  if (resetTemplateLibraryButton) {
    resetTemplateLibraryButton.addEventListener('click', async () => {
      const shouldReset = window.confirm(t('reset_template_library_confirm'));
      if (!shouldReset) return;

      localStorage.removeItem(TEMPLATE_LIBRARY_STORAGE_KEY);
      const next = getSettings();
      next.resetTemplateLibraryAt = Date.now();
      await publishSettings(next);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
