import 'monaco-editor/min/vs/editor/editor.main.css';

import {emit, emitTo, listen} from '@tauri-apps/api/event';
import {open, save} from '@tauri-apps/plugin-dialog';
import {readTextFile, writeTextFile} from '@tauri-apps/plugin-fs';
import {getCurrentWindow} from '@tauri-apps/api/window';

import {installAntiInspect} from './anti-inspect.js';
import {applyI18n, setLocale, t} from './i18n.js';
import exampleLibrary from './data/example-library.json';

const INSERT_EXAMPLE_TEMPLATE_EVENT = 'example-library-insert-template';
const SETTINGS_EVENT = 'settings-updated';
installAntiInspect();

const DEFAULT_UI_FONT =
  '-apple-system, BlinkMacSystemFont, \'SF Pro Text\', \'Helvetica Neue\', sans-serif';
const DEFAULT_CODE_FONT =
  '\'SF Mono\', \'JetBrains Mono\', Menlo, Monaco, monospace';
const DEFAULT_UI_FONT_SIZE = 14;
const MIN_UI_FONT_SIZE = 12;
const MAX_UI_FONT_SIZE = 24;
const DEFAULT_APPEARANCE = 'system';
const COLUMN_LAYOUT_STORAGE_KEY = 'example-library-column-layout-v1';
const TEMPLATE_LIBRARY_STORAGE_KEY = 'example-library-templates-v1';
const TEMPLATE_BACKUP_VERSION = 2;
const DEFAULT_NEW_TEMPLATE_CODE = 'graph TD\n  A[Start] --> B[End]';
const DEFAULT_NEW_TEMPLATE_CATEGORY = 'Misc';
const DEFAULT_NEW_TEMPLATE_SOURCE_FILE = 'Custom';
const COLUMN_DEFAULTS = {
  col1: 220,
  col2: 340,
};
const COLUMN_MIN = {
  col1: 170,
  col2: 220,
  col3: 320,
};

const searchInput = document.getElementById('template-search');
const categoryList = document.getElementById('category-list');
const templateList = document.getElementById('template-list');
const templateCount = document.getElementById('template-count');
const selectedTitle = document.getElementById('selected-title');
const selectedMeta = document.getElementById('selected-meta');
const templateNameInput = document.getElementById('template-name-input');
const templateCategorySelect = document.getElementById('template-category-select');
const selectedCodeEditorContainer = document.getElementById('selected-code-editor');
const btnInsert = document.getElementById('btn-insert');
const btnInsertClose = document.getElementById('btn-insert-close');
const btnClose = document.getElementById('btn-close');
const btnAddTemplate = document.getElementById('btn-add-template');
const btnDeleteTemplate = document.getElementById('btn-delete-template');
const btnImportTemplates = document.getElementById('btn-import-templates');
const btnBackupTemplates = document.getElementById('btn-backup-templates');
const btnAddCategory = document.getElementById('btn-add-category');
const btnDeleteCategory = document.getElementById('btn-delete-category');
const libraryLayout = document.querySelector('.library-layout');
const libraryResizers = [...document.querySelectorAll('.library-resizer')];

let monaco = null;
let monacoWorker = null;
let monacoLoadPromise = null;
let previewEditor = null;
let previewThemeMedia = null;
let systemAppearanceMedia = null;
let pendingPreviewCode = '';
let currentCodeFont = DEFAULT_CODE_FONT;
let editAutosaveTimer = null;
const bundledTemplates = Array.isArray(exampleLibrary?.templates) ? exampleLibrary.templates : [];
const persistedLibrary = loadPersistedLibrary();
let library = persistedLibrary?.templates || null;
if (!library || library.length === 0) {
  library = normalizeLibraryTemplates(bundledTemplates);
}
let customCategories = persistedLibrary?.categories || [];
let columnRatios = loadColumnRatios();
let resizeState = null;

const state = {
  activeCategory: 'all',
  query: '',
  selectedId: library[0]?.id || null,
  previewTemplateId: null,
  pendingTemplateDeleteId: null,
  isAddingCategory: false,
  pendingCategoryName: '',
};

function normalizeFontValue(rawValue, fallback) {
  const value = String(rawValue || '').trim();
  return value || fallback;
}

function getUiFont() {
  return normalizeFontValue(localStorage.getItem('uiFont'), DEFAULT_UI_FONT);
}

function parseUiFontSize(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_UI_FONT_SIZE;
  return Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(parsed)));
}

function getUiFontSize() {
  return parseUiFontSize(localStorage.getItem('uiFontSize'));
}

function getCodeFont() {
  return normalizeFontValue(localStorage.getItem('codeFont'), DEFAULT_CODE_FONT);
}

function applyUiFont(fontFamily) {
  const value = normalizeFontValue(fontFamily, DEFAULT_UI_FONT);
  document.documentElement.style.setProperty('--app-ui-font', value);
}

function applyUiFontSize(fontSize) {
  const value = parseUiFontSize(fontSize);
  document.documentElement.style.setProperty('--app-ui-font-size', `${value}px`);
}

function applyCodeFont(fontFamily) {
  const value = normalizeFontValue(fontFamily, DEFAULT_CODE_FONT);
  currentCodeFont = value;
  if (!previewEditor) return;
  previewEditor.updateOptions({fontFamily: value});
}

function normalizeAppearance(rawValue) {
  const value = String(rawValue || DEFAULT_APPEARANCE).trim().toLowerCase();
  return ['system', 'light', 'dark'].includes(value) ?
    value :
    DEFAULT_APPEARANCE;
}

function isDarkEffective() {
  const appearance = document.documentElement.getAttribute('data-theme');
  if (appearance === 'dark') return true;
  if (appearance === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
  applyPreviewEditorTheme();
}

function handleSystemAppearanceChange() {
  const currentMode = normalizeAppearance(localStorage.getItem('appearance'));
  if (currentMode === DEFAULT_APPEARANCE) {
    applyAppearance(currentMode);
  }
}

function initAppearanceSync() {
  applyAppearance(localStorage.getItem('appearance'));

  if (systemAppearanceMedia) return;
  systemAppearanceMedia = window.matchMedia('(prefers-color-scheme: dark)');
  systemAppearanceMedia.addEventListener('change', handleSystemAppearanceChange);
}

function normalizeSearchTerm(value) {
  return String(value || '').trim().toLowerCase();
}

function formatTemplateTitle(title) {
  return String(title || '')
      .replace(/^[\s:.-]+/g, '')
      .trim();
}

function normalizeCategoryName(value) {
  return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
}

function normalizeCategoryList(categories) {
  const unique = new Map();
  for (const raw of categories || []) {
    const name = normalizeCategoryName(raw);
    if (!name) continue;
    if (name.toLowerCase() === 'all') continue;
    const key = name.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, name);
    }
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function sanitizeTemplateId(value, fallbackIndex = 0) {
  const raw = String(value || '').trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  if (cleaned) return cleaned;
  return `template-${Date.now()}-${fallbackIndex}`;
}

function normalizeTemplate(template, index = 0) {
  if (!template || typeof template !== 'object') return null;

  const title = formatTemplateTitle(template.title || template.name || 'Untitled Template') ||
    'Untitled Template';
  const category = normalizeCategoryName(template.category || DEFAULT_NEW_TEMPLATE_CATEGORY) ||
    DEFAULT_NEW_TEMPLATE_CATEGORY;
  const sourceFile = String(template.source?.file || template.sourceFile || 'Custom').trim() ||
    'Custom';
  const sourceFormat = String(template.source?.format || template.sourceFormat || 'json').trim() ||
    'json';
  const id = sanitizeTemplateId(template.id || title, index);

  return {
    id,
    title,
    category,
    source: {
      file: sourceFile,
      format: sourceFormat,
    },
    code: String(template.code || ''),
  };
}

function normalizeLibraryTemplates(templates) {
  const byId = new Map();
  for (let index = 0; index < templates.length; index += 1) {
    const normalized = normalizeTemplate(templates[index], index);
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function findTemplateIndex(templateId) {
  return library.findIndex((template) => template.id === templateId);
}

function createUniqueTemplateId(seedTitle) {
  const usedIds = new Set(library.map((template) => template.id));
  const base = sanitizeTemplateId(seedTitle || 'template');
  if (!usedIds.has(base)) return base;
  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function createUniqueTemplateTitle(baseTitle) {
  const base = formatTemplateTitle(baseTitle || t('new_template')) || t('new_template');
  const usedTitles = new Set(library.map((template) => String(template.title || '').toLowerCase()));
  if (!usedTitles.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (usedTitles.has(`${base} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

function persistEditingTemplateCode() {
  if (!previewEditor || !state.previewTemplateId) return;
  const index = findTemplateIndex(state.previewTemplateId);
  if (index < 0) return;
  const nextCode = previewEditor.getValue();
  if (library[index].code === nextCode && library[index].source?.format) return;
  library[index] = {
    ...library[index],
    code: nextCode,
    source: {
      ...library[index].source,
      format: library[index].source?.format || 'mermaid',
    },
  };
  persistLibrary();
}

function flushEditingAutosave() {
  if (editAutosaveTimer) {
    window.clearTimeout(editAutosaveTimer);
    editAutosaveTimer = null;
  }
  persistEditingTemplateCode();
}

function queueEditingAutosave() {
  if (editAutosaveTimer) {
    window.clearTimeout(editAutosaveTimer);
  }
  editAutosaveTimer = window.setTimeout(() => {
    editAutosaveTimer = null;
    persistEditingTemplateCode();
  }, 140);
}

function persistLibrary() {
  try {
    localStorage.setItem(
        TEMPLATE_LIBRARY_STORAGE_KEY,
        JSON.stringify({
          version: TEMPLATE_BACKUP_VERSION,
          templates: library,
          categories: customCategories,
        }),
    );
  } catch (storageError) {
    console.warn('Failed to persist library templates', storageError);
  }
}

function loadPersistedLibrary() {
  try {
    const raw = localStorage.getItem(TEMPLATE_LIBRARY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const templates = Array.isArray(parsed) ? parsed : parsed?.templates;
    if (!Array.isArray(templates)) return null;
    const normalizedTemplates = normalizeLibraryTemplates(templates);
    const parsedCategories = Array.isArray(parsed?.categories) ? parsed.categories : [];
    const normalizedCategories = normalizeCategoryList(parsedCategories);
    return {
      templates: normalizedTemplates,
      categories: normalizedCategories,
    };
  } catch (storageError) {
    console.warn('Failed to read persisted library templates', storageError);
    return null;
  }
}

async function ensureMonacoLoaded() {
  if (monaco && monacoWorker) return monaco;
  if (!monacoLoadPromise) {
    monacoLoadPromise = Promise.all([
      import('monaco-editor/esm/vs/editor/editor.api'),
      import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    ])
        .then(([monacoModule, workerModule]) => {
          monaco = monacoModule;
          monacoWorker = workerModule.default;
          if (typeof self !== 'undefined') {
            self.MonacoEnvironment = {
              getWorker() {
                return new monacoWorker();
              },
            };
          }
          return monaco;
        })
        .catch((error) => {
          monacoLoadPromise = null;
          throw error;
        });
  }
  return monacoLoadPromise;
}

function applyPreviewEditorTheme() {
  if (!monaco) return;
  monaco.editor.setTheme(isDarkEffective() ? 'vs-dark' : 'vs');
}

function relayoutPreviewEditor() {
  if (!previewEditor) return;
  requestAnimationFrame(() => {
    previewEditor?.layout();
  });
}

async function initPreviewEditor() {
  if (!selectedCodeEditorContainer || previewEditor) return;
  await ensureMonacoLoaded();
  if (previewEditor) return;

  previewEditor = monaco.editor.create(selectedCodeEditorContainer, {
    value: pendingPreviewCode,
    language: 'plaintext',
    readOnly: false,
    minimap: {enabled: false},
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fontFamily: currentCodeFont,
    fontSize: 12,
    lineNumbersMinChars: 3,
    lineNumbers: 'on',
    wordWrap: 'off',
    tabSize: 2,
    scrollbar: {
      vertical: 'visible',
      horizontal: 'auto',
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
      alwaysConsumeMouseWheel: false,
      useShadows: false,
    },
  });

  applyPreviewEditorTheme();
  previewEditor.onDidChangeModelContent(() => {
    queueEditingAutosave();
  });

  if (!previewThemeMedia) {
    previewThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    previewThemeMedia.addEventListener('change', applyPreviewEditorTheme);
  }
}

function setPreviewCode(code) {
  const text = String(code || '');
  pendingPreviewCode = text;
  if (!previewEditor) return;
  if (previewEditor.getValue() !== text) {
    previewEditor.setValue(text);
  }
}

function getLayoutMetrics() {
  if (!libraryLayout) return null;
  const styles = getComputedStyle(libraryLayout);
  const paddingLeft = parseFloat(styles.paddingLeft) || 0;
  const paddingRight = parseFloat(styles.paddingRight) || 0;
  const columnGap = parseFloat(styles.columnGap) || 0;
  const resizerSize = parseFloat(styles.getPropertyValue('--library-resizer-size')) || 10;
  const available = libraryLayout.clientWidth -
    paddingLeft - paddingRight -
    (columnGap * 4) -
    (resizerSize * 2);
  return {available: Math.max(0, available)};
}

function readCurrentColumnSizes() {
  if (!libraryLayout) {
    return {...COLUMN_DEFAULTS};
  }
  const styles = getComputedStyle(libraryLayout);
  const col1 = parseFloat(styles.getPropertyValue('--library-col-1-size')) || COLUMN_DEFAULTS.col1;
  const col2 = parseFloat(styles.getPropertyValue('--library-col-2-size')) || COLUMN_DEFAULTS.col2;
  return {col1, col2};
}

function clampColumnSizes(col1, col2, availableWidth) {
  const maxCol1 = Math.max(COLUMN_MIN.col1, availableWidth - COLUMN_MIN.col2 - COLUMN_MIN.col3);
  const nextCol1 = clamp(col1, COLUMN_MIN.col1, maxCol1);
  const maxCol2 = Math.max(COLUMN_MIN.col2, availableWidth - nextCol1 - COLUMN_MIN.col3);
  const nextCol2 = clamp(col2, COLUMN_MIN.col2, maxCol2);
  return {
    col1: Math.round(nextCol1),
    col2: Math.round(nextCol2),
  };
}

function columnsToRatios(columns, availableWidth) {
  if (availableWidth <= 0) return null;
  const col1 = columns.col1 / availableWidth;
  const col2 = columns.col2 / availableWidth;
  if (!Number.isFinite(col1) || !Number.isFinite(col2)) return null;
  if (col1 <= 0 || col2 <= 0 || col1 + col2 >= 0.95) return null;
  return {col1, col2};
}

function saveColumnRatios(ratios) {
  if (!ratios) return;
  try {
    localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY, JSON.stringify(ratios));
  } catch (storageError) {
    console.warn('Failed to persist example library column layout', storageError);
  }
}

function loadColumnRatios() {
  try {
    const raw = localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const col1 = Number(parsed.col1);
    const col2 = Number(parsed.col2);
    if (!Number.isFinite(col1) || !Number.isFinite(col2)) return null;
    if (col1 <= 0 || col2 <= 0 || col1 + col2 >= 0.95) return null;
    return {col1, col2};
  } catch (storageError) {
    console.warn('Failed to read example library column layout', storageError);
    return null;
  }
}

function applyColumnSizes(columns, options = {}) {
  if (!libraryLayout) return;
  libraryLayout.style.setProperty('--library-col-1-size', `${columns.col1}px`);
  libraryLayout.style.setProperty('--library-col-2-size', `${columns.col2}px`);
  const metrics = getLayoutMetrics();
  if (!metrics) return;
  columnRatios = columnsToRatios(columns, metrics.available) || columnRatios;
  if (options.persist) {
    saveColumnRatios(columnRatios);
  }
  relayoutPreviewEditor();
}

function syncColumnLayout() {
  if (!libraryLayout) return;

  const metrics = getLayoutMetrics();
  if (!metrics || metrics.available <= 0) return;
  const tentative = columnRatios ? {
    col1: metrics.available * columnRatios.col1,
    col2: metrics.available * columnRatios.col2,
  } : {...COLUMN_DEFAULTS};
  const clamped = clampColumnSizes(tentative.col1, tentative.col2, metrics.available);
  applyColumnSizes(clamped);
}

function onResizerPointerMove(event) {
  if (!resizeState) return;
  const metrics = getLayoutMetrics();
  if (!metrics || metrics.available <= 0) return;

  const deltaX = event.clientX - resizeState.startX;
  const nextColumns = resizeState.resizerIndex === 1 ?
    clampColumnSizes(
        resizeState.startColumns.col1 + deltaX,
        resizeState.startColumns.col2,
        metrics.available,
    ) :
    clampColumnSizes(
        resizeState.startColumns.col1,
        resizeState.startColumns.col2 + deltaX,
        metrics.available,
    );
  applyColumnSizes(nextColumns);
}

function stopResizerDrag() {
  if (!resizeState) return;
  resizeState = null;
  document.body.classList.remove('is-resizing-columns');
  window.removeEventListener('pointermove', onResizerPointerMove);
  window.removeEventListener('pointerup', stopResizerDrag);
  window.removeEventListener('pointercancel', stopResizerDrag);
  saveColumnRatios(columnRatios);
}

function startResizerDrag(event, resizerIndex) {
  if (!libraryLayout) return;
  if (event.button !== 0) return;

  resizeState = {
    resizerIndex,
    startX: event.clientX,
    startColumns: readCurrentColumnSizes(),
  };
  document.body.classList.add('is-resizing-columns');
  window.addEventListener('pointermove', onResizerPointerMove);
  window.addEventListener('pointerup', stopResizerDrag);
  window.addEventListener('pointercancel', stopResizerDrag);
  event.preventDefault();
}

function nudgeColumns(resizerIndex, deltaX) {
  const metrics = getLayoutMetrics();
  if (!metrics || metrics.available <= 0) return;

  const current = readCurrentColumnSizes();
  const nextColumns = resizerIndex === 1 ?
    clampColumnSizes(current.col1 + deltaX, current.col2, metrics.available) :
    clampColumnSizes(current.col1, current.col2 + deltaX, metrics.available);
  applyColumnSizes(nextColumns, {persist: true});
}

function onResizerKeyDown(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const resizerIndex = Number(event.currentTarget.dataset.resizer);
  if (!resizerIndex) return;
  const step = event.shiftKey ? 24 : 12;
  const delta = event.key === 'ArrowRight' ? step : -step;
  nudgeColumns(resizerIndex, delta);
  event.preventDefault();
}

function initResizableColumns() {
  if (!libraryLayout) return;

  for (const resizer of libraryResizers) {
    const resizerIndex = Number(resizer.dataset.resizer);
    if (!resizerIndex) continue;
    resizer.addEventListener('pointerdown', (event) => {
      startResizerDrag(event, resizerIndex);
    });
    resizer.addEventListener('keydown', onResizerKeyDown);
  }

  window.addEventListener('resize', () => {
    syncColumnLayout();
    stopResizerDrag();
    relayoutPreviewEditor();
  });

  syncColumnLayout();
}

function categoriesWithCounts() {
  const counts = new Map();
  for (const template of library) {
    const category = normalizeCategoryName(template.category || DEFAULT_NEW_TEMPLATE_CATEGORY) ||
      DEFAULT_NEW_TEMPLATE_CATEGORY;
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  for (const category of customCategories) {
    const normalized = normalizeCategoryName(category);
    if (!normalized || normalized.toLowerCase() === 'all') continue;
    if (!counts.has(normalized)) {
      counts.set(normalized, 0);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return [{name: 'all', count: library.length}, ...sorted.map(([name, count]) => ({
    name,
    count,
  }))];
}

function matchesQuery(template, query) {
  if (!query) return true;
  const haystacks = [
    formatTemplateTitle(template.title),
    template.category,
    template.code,
    template.source?.file,
  ].map((value) => String(value || '').toLowerCase());
  return haystacks.some((haystack) => haystack.includes(query));
}

function filteredTemplates() {
  const query = normalizeSearchTerm(state.query);
  return library.filter((template) => {
    if (state.activeCategory !== 'all' && template.category !== state.activeCategory) {
      return false;
    }
    return matchesQuery(template, query);
  });
}

function resolveSelectedTemplate(templates) {
  const active = templates.find((template) => template.id === state.selectedId);
  if (active) return active;
  const next = templates[0] || null;
  state.selectedId = next ? next.id : null;
  return next;
}

function clearPendingTemplateDelete() {
  state.pendingTemplateDeleteId = null;
}

function clearCategoryComposer() {
  state.isAddingCategory = false;
  state.pendingCategoryName = '';
}

function countTemplatesInCategory(categoryName) {
  return library.filter((template) => template.category === categoryName).length;
}

function refreshTemplateDeleteButton() {
  if (!btnDeleteTemplate) return;
  const selected = getSelectedTemplate();
  if (!selected) {
    btnDeleteTemplate.disabled = true;
    btnDeleteTemplate.classList.remove('is-pending-delete');
    btnDeleteTemplate.title = t('delete_template');
    btnDeleteTemplate.setAttribute('aria-label', t('delete_template'));
    return;
  }
  const pending = state.pendingTemplateDeleteId === selected.id;
  btnDeleteTemplate.disabled = false;
  btnDeleteTemplate.classList.toggle('is-pending-delete', pending);
  const actionLabel = pending ? t('confirm_delete_template') : t('delete_template');
  btnDeleteTemplate.title = actionLabel;
  btnDeleteTemplate.setAttribute('aria-label', actionLabel);
}

function refreshCategoryActionButtons() {
  if (!btnDeleteCategory) return;
  if (state.activeCategory === 'all') {
    btnDeleteCategory.disabled = true;
    btnDeleteCategory.title = t('delete_category');
    btnDeleteCategory.setAttribute('aria-label', t('delete_category'));
    return;
  }
  const count = countTemplatesInCategory(state.activeCategory);
  const canDelete = count === 0;
  btnDeleteCategory.disabled = !canDelete;
  const title = canDelete ? t('delete_category') : t('category_delete_blocked_nonempty');
  btnDeleteCategory.title = title;
  btnDeleteCategory.setAttribute('aria-label', title);
}

function refreshStaticActionLabels() {
  if (btnAddTemplate) {
    const label = t('add_template');
    btnAddTemplate.title = label;
    btnAddTemplate.setAttribute('aria-label', label);
  }
  if (btnAddCategory) {
    const label = t('add_category');
    btnAddCategory.title = label;
    btnAddCategory.setAttribute('aria-label', label);
  }
  if (templateNameInput) {
    templateNameInput.setAttribute('aria-label', t('template_name_label'));
  }
  if (templateCategorySelect) {
    templateCategorySelect.setAttribute('aria-label', t('template_category_label'));
  }
}

function categoryNameExists(categoryName) {
  const target = normalizeCategoryName(categoryName).toLowerCase();
  if (!target) return false;
  return categoriesWithCounts().some((category) => category.name.toLowerCase() === target);
}

function commitCategoryCreation() {
  const normalized = normalizeCategoryName(state.pendingCategoryName);
  const categoryInput = categoryList.querySelector('.category-input');
  if (!normalized || normalized.toLowerCase() === 'all') {
    categoryInput?.setAttribute('title', t('category_name_invalid'));
    categoryInput?.classList.add('invalid');
    return;
  }
  if (categoryNameExists(normalized)) {
    categoryInput?.setAttribute('title', t('category_name_exists'));
    categoryInput?.classList.add('invalid');
    return;
  }

  customCategories = normalizeCategoryList([...customCategories, normalized]);
  clearCategoryComposer();
  state.activeCategory = normalized;
  clearPendingTemplateDelete();
  persistLibrary();
  render();
}

function startCategoryCreation() {
  clearPendingTemplateDelete();
  state.isAddingCategory = true;
  state.pendingCategoryName = '';
  render();
}

function cancelCategoryCreation() {
  clearCategoryComposer();
  render();
}

function removeActiveCategory() {
  if (state.activeCategory === 'all') return;
  if (countTemplatesInCategory(state.activeCategory) > 0) return;
  customCategories = customCategories.filter((name) => name !== state.activeCategory);
  state.activeCategory = 'all';
  clearCategoryComposer();
  clearPendingTemplateDelete();
  persistLibrary();
  render();
}

function createCategoryButton(category) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'category-item';
  if (state.activeCategory === category.name) {
    button.classList.add('active');
  }
  const title = category.name === 'all' ? t('all_categories') : category.name;
  button.textContent = `${title} (${category.count})`;
  button.addEventListener('click', () => {
    if (state.activeCategory !== category.name) {
      clearPendingTemplateDelete();
    }
    clearCategoryComposer();
    state.activeCategory = category.name;
    render();
  });
  return button;
}

function createCategoryComposer() {
  const wrap = document.createElement('div');
  wrap.className = 'category-composer';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'category-input';
  input.placeholder = t('category_name_placeholder');
  input.value = state.pendingCategoryName;
  input.autocomplete = 'off';
  input.spellcheck = false;

  const onCategoryInput = () => {
    state.pendingCategoryName = input.value;
    input.classList.remove('invalid');
    input.removeAttribute('title');
  };

  input.addEventListener('input', onCategoryInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCategoryCreation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCategoryCreation();
    }
  });
  input.addEventListener('blur', () => {
    if (state.isAddingCategory) {
      cancelCategoryCreation();
    }
  });

  wrap.appendChild(input);
  requestAnimationFrame(() => input.focus());
  return wrap;
}

function renderCategories() {
  categoryList.innerHTML = '';
  if (state.isAddingCategory) {
    categoryList.appendChild(createCategoryComposer());
  }
  for (const category of categoriesWithCounts()) {
    categoryList.appendChild(createCategoryButton(category));
  }
}

function addTemplateEntry() {
  flushEditingAutosave();

  const category = state.activeCategory === 'all' ?
    DEFAULT_NEW_TEMPLATE_CATEGORY :
    state.activeCategory;
  const title = createUniqueTemplateTitle(t('new_template'));
  const id = createUniqueTemplateId(title);

  const newTemplate = {
    id,
    title,
    category,
    source: {
      file: DEFAULT_NEW_TEMPLATE_SOURCE_FILE,
      format: 'mermaid',
    },
    code: DEFAULT_NEW_TEMPLATE_CODE,
  };

  library = [newTemplate, ...library];
  persistLibrary();
  clearPendingTemplateDelete();
  clearCategoryComposer();
  state.query = '';
  if (searchInput) {
    searchInput.value = '';
  }
  state.selectedId = newTemplate.id;
  render();
}

function createTemplateButton(template) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'template-item';
  if (template.id === state.selectedId) {
    button.classList.add('active');
  }
  const title = document.createElement('div');
  title.className = 'template-item-title';
  title.textContent = formatTemplateTitle(template.title);
  const meta = document.createElement('div');
  meta.className = 'template-item-meta';
  meta.textContent = `${template.category} • ${template.source?.format || 'source'}`;
  button.appendChild(title);
  button.appendChild(meta);
  button.addEventListener('click', () => {
    if (state.selectedId !== template.id) {
      flushEditingAutosave();
      clearPendingTemplateDelete();
    }
    clearCategoryComposer();
    state.selectedId = template.id;
    render();
  });
  button.addEventListener('dblclick', async () => {
    flushEditingAutosave();
    state.selectedId = template.id;
    render();
    await insertCurrentTemplate(true);
  });
  return button;
}

function renderTemplates(templates) {
  templateList.innerHTML = '';
  if (templates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('no_templates_found');
    templateList.appendChild(empty);
    return;
  }
  for (const template of templates) {
    templateList.appendChild(createTemplateButton(template));
  }
}

function templateEditorCategories(template) {
  const categories = categoriesWithCounts()
      .map((entry) => entry.name)
      .filter((name) => name !== 'all');
  const current = normalizeCategoryName(template?.category || '');
  if (current && !categories.includes(current)) {
    categories.unshift(current);
  }
  if (categories.length === 0) {
    categories.push(DEFAULT_NEW_TEMPLATE_CATEGORY);
  }
  return categories;
}

function syncTemplateEditorControls(template) {
  if (!templateNameInput || !templateCategorySelect) return;

  if (!template) {
    templateNameInput.value = '';
    templateNameInput.disabled = true;
    templateCategorySelect.innerHTML = '';
    templateCategorySelect.disabled = true;
    return;
  }

  const displayTitle = formatTemplateTitle(template.title) || t('new_template');
  if (document.activeElement !== templateNameInput) {
    templateNameInput.value = displayTitle;
  }
  templateNameInput.disabled = false;

  const categories = templateEditorCategories(template);
  const fragment = document.createDocumentFragment();
  for (const categoryName of categories) {
    const option = document.createElement('option');
    option.value = categoryName;
    option.textContent = categoryName;
    fragment.appendChild(option);
  }
  templateCategorySelect.innerHTML = '';
  templateCategorySelect.appendChild(fragment);
  templateCategorySelect.value = categories.includes(template.category) ?
    template.category :
    categories[0];
  templateCategorySelect.disabled = false;
}

function updateSelectedTemplateMeta({title, category}) {
  const selected = getSelectedTemplate();
  if (!selected) return null;
  const index = findTemplateIndex(selected.id);
  if (index < 0) return null;

  const current = library[index];
  const nextTitle = title === undefined ?
    current.title :
    (formatTemplateTitle(title) || t('new_template'));
  const nextCategory = category === undefined ?
    current.category :
    (normalizeCategoryName(category) || DEFAULT_NEW_TEMPLATE_CATEGORY);

  if (nextTitle === current.title && nextCategory === current.category) {
    return current;
  }

  library[index] = {
    ...current,
    title: nextTitle,
    category: nextCategory,
  };
  persistLibrary();
  return library[index];
}

function renderPreview(template) {
  if (!template) {
    state.previewTemplateId = null;
    selectedTitle.textContent = t('no_template_selected');
    selectedMeta.textContent = '';
    syncTemplateEditorControls(null);
    setPreviewCode('');
    btnInsert.disabled = true;
    btnInsertClose.disabled = true;
    refreshTemplateDeleteButton();
    refreshCategoryActionButtons();
    return;
  }

  selectedTitle.textContent = formatTemplateTitle(template.title) || t('new_template');
  selectedMeta.textContent = `${template.category} • ${template.source?.file || ''}`;
  syncTemplateEditorControls(template);

  if (state.previewTemplateId !== template.id) {
    state.previewTemplateId = template.id;
    setPreviewCode(template.code);
  }

  btnInsert.disabled = false;
  btnInsertClose.disabled = false;
  refreshTemplateDeleteButton();
  refreshCategoryActionButtons();
}

function getSelectedTemplate() {
  return library.find((template) => template.id === state.selectedId) || null;
}

function deleteSelectedTemplateTwoStep() {
  flushEditingAutosave();
  const selected = getSelectedTemplate();
  if (!selected) return;

  if (state.pendingTemplateDeleteId !== selected.id) {
    state.pendingTemplateDeleteId = selected.id;
    render();
    return;
  }

  library = library.filter((template) => template.id !== selected.id);
  state.pendingTemplateDeleteId = null;
  if (state.selectedId === selected.id) {
    state.selectedId = library[0]?.id || null;
  }
  persistLibrary();
  render();
}

function parseImportedTemplatePayload(parsed) {
  if (Array.isArray(parsed)) {
    return {templates: parsed, categories: []};
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.templates)) {
    return {
      templates: parsed.templates,
      categories: normalizeCategoryList(Array.isArray(parsed.categories) ? parsed.categories : []),
    };
  }
  return null;
}

async function importTemplates() {
  try {
    flushEditingAutosave();
    clearPendingTemplateDelete();
    clearCategoryComposer();

    const selectedPath = await open({
      multiple: false,
      filters: [
        {
          name: 'JSON',
          extensions: ['json'],
        },
      ],
    });

    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }

    const raw = await readTextFile(selectedPath);
    const parsed = JSON.parse(raw);
    const incoming = parseImportedTemplatePayload(parsed);
    if (!incoming) {
      window.alert(t('import_templates_invalid'));
      return;
    }

    const importedTemplates = normalizeLibraryTemplates(incoming.templates);
    if (importedTemplates.length === 0) {
      window.alert(t('import_templates_empty'));
      return;
    }

    const byId = new Map(library.map((template) => [template.id, template]));
    for (const template of importedTemplates) {
      byId.set(template.id, template);
    }
    library = [...byId.values()];
    customCategories = normalizeCategoryList([...customCategories, ...incoming.categories]);
    persistLibrary();

    state.selectedId = importedTemplates[0]?.id || library[0]?.id || null;
    clearPendingTemplateDelete();
    render();
    window.alert(`${t('import_templates_success')}: ${importedTemplates.length}`);
  } catch (error) {
    console.error('Failed to import templates', error);
    window.alert(t('import_templates_failed'));
  }
}

function backupFileName() {
  const now = new Date();
  const isoDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `example-library-backup-${isoDate}.json`;
}

async function backupTemplates() {
  try {
    const destination = await save({
      title: t('backup_templates'),
      defaultPath: backupFileName(),
      filters: [
        {
          name: 'JSON',
          extensions: ['json'],
        },
      ],
    });

    if (!destination) {
      return;
    }

    const payload = {
      libraryName: exampleLibrary?.libraryName || 'Example Library',
      version: TEMPLATE_BACKUP_VERSION,
      generatedOn: new Date().toISOString(),
      totalTemplates: library.length,
      categories: customCategories,
      templates: library,
    };

    await writeTextFile(destination, JSON.stringify(payload, null, 2));
    window.alert(t('backup_templates_success'));
  } catch (error) {
    console.error('Failed to backup templates', error);
    window.alert(t('backup_templates_failed'));
  }
}

async function insertCurrentTemplate(closeAfterInsert = false) {
  const template = getSelectedTemplate();
  if (!template) return;
  const payload = {
    id: template.id,
    title: formatTemplateTitle(template.title),
    category: template.category,
    code: template.code,
  };
  let emitError = null;
  try {
    await emitTo('main', INSERT_EXAMPLE_TEMPLATE_EVENT, payload);
  } catch (directEmitError) {
    try {
      await emit(INSERT_EXAMPLE_TEMPLATE_EVENT, payload);
    } catch (broadcastEmitError) {
      emitError = {directEmitError, broadcastEmitError};
    }
  }
  if (closeAfterInsert) {
    await closeLibraryWindow();
  }
  if (emitError) {
    console.error('Failed to insert template event', emitError);
  }
}

async function closeLibraryWindow() {
  flushEditingAutosave();
  clearCategoryComposer();
  clearPendingTemplateDelete();

  const window = getCurrentWindow();
  try {
    await window.close();
  } catch (closeError) {
    console.warn('Window close failed, trying destroy()', closeError);
    try {
      await window.destroy();
    } catch (destroyError) {
      console.error('Window destroy failed', destroyError);
    }
  }
}

function render() {
  flushEditingAutosave();
  const categories = categoriesWithCounts();
  if (state.activeCategory !== 'all' &&
      !categories.some((category) => category.name === state.activeCategory)) {
    state.activeCategory = 'all';
  }
  const templates = filteredTemplates();
  renderCategories();
  renderTemplates(templates);
  const selected = resolveSelectedTemplate(templates);
  renderPreview(selected);
  templateCount.textContent = `${templates.length} / ${library.length}`;
  refreshStaticActionLabels();
  refreshTemplateDeleteButton();
  refreshCategoryActionButtons();
  relayoutPreviewEditor();
}

function initEvents() {
  searchInput.addEventListener('input', (event) => {
    clearPendingTemplateDelete();
    clearCategoryComposer();
    state.query = event.target.value;
    render();
  });

  btnInsert.addEventListener('click', async () => {
    await insertCurrentTemplate(false);
  });

  btnInsertClose.addEventListener('click', async () => {
    await insertCurrentTemplate(true);
  });

  btnAddTemplate?.addEventListener('click', () => {
    addTemplateEntry();
  });

  btnDeleteTemplate?.addEventListener('click', () => {
    deleteSelectedTemplateTwoStep();
  });

  btnAddCategory?.addEventListener('click', () => {
    startCategoryCreation();
  });

  btnDeleteCategory?.addEventListener('click', () => {
    removeActiveCategory();
  });

  btnImportTemplates?.addEventListener('click', async () => {
    await importTemplates();
  });

  btnBackupTemplates?.addEventListener('click', async () => {
    await backupTemplates();
  });

  templateNameInput?.addEventListener('input', (event) => {
    const updated = updateSelectedTemplateMeta({title: event.target.value});
    if (!updated) return;
    selectedTitle.textContent = formatTemplateTitle(updated.title) || t('new_template');
    clearPendingTemplateDelete();
  });

  templateNameInput?.addEventListener('blur', () => {
    const updated = updateSelectedTemplateMeta({title: templateNameInput.value});
    if (!updated) return;
    templateNameInput.value = formatTemplateTitle(updated.title) || t('new_template');
    render();
  });

  templateCategorySelect?.addEventListener('change', (event) => {
    const updated = updateSelectedTemplateMeta({category: event.target.value});
    if (!updated) return;
    if (state.activeCategory !== 'all' && state.activeCategory !== updated.category) {
      state.activeCategory = updated.category;
    }
    clearPendingTemplateDelete();
    render();
  });

  btnClose.addEventListener('click', async () => {
    await closeLibraryWindow();
  });

  document.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      if (state.isAddingCategory) {
        cancelCategoryCreation();
        return;
      }
      if (state.pendingTemplateDeleteId) {
        clearPendingTemplateDelete();
        render();
        return;
      }
      await closeLibraryWindow();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      flushEditingAutosave();
      event.preventDefault();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      await insertCurrentTemplate(false);
      event.preventDefault();
    }
  });

  window.addEventListener('beforeunload', () => {
    flushEditingAutosave();
    previewThemeMedia?.removeEventListener('change', applyPreviewEditorTheme);
    systemAppearanceMedia?.removeEventListener('change', handleSystemAppearanceChange);
    previewEditor?.dispose();
  });
}

function initSettingsSync() {
  listen(SETTINGS_EVENT, (event) => {
    const payload = event.payload || {};
    if (payload.locale) {
      setLocale(payload.locale);
      applyI18n(document);
      refreshStaticActionLabels();
      render();
    }
    if (typeof payload.appearance === 'string') {
      const nextAppearance = normalizeAppearance(payload.appearance);
      localStorage.setItem('appearance', nextAppearance);
      applyAppearance(nextAppearance);
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
    if (payload.resetTemplateLibraryAt !== undefined) {
      library = normalizeLibraryTemplates(bundledTemplates);
      customCategories = [];
      persistLibrary();
      state.activeCategory = 'all';
      state.query = '';
      clearPendingTemplateDelete();
      clearCategoryComposer();
      if (searchInput) {
        searchInput.value = '';
      }
      state.selectedId = library[0]?.id || null;
      state.previewTemplateId = null;
      render();
    }
  });
}

function schedulePreviewEditorInit() {
  const boot = () => {
    void initPreviewEditor().then(() => {
      relayoutPreviewEditor();
    }).catch((error) => {
      console.error('Failed to initialize preview editor', error);
    });
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(boot, {timeout: 1200});
    return;
  }
  window.setTimeout(boot, 0);
}

function init() {
  initAppearanceSync();
  applyUiFont(getUiFont());
  applyUiFontSize(getUiFontSize());
  applyI18n(document);
  applyCodeFont(getCodeFont());
  initSettingsSync();
  initResizableColumns();
  initEvents();
  render();
  schedulePreviewEditorInit();
}

document.addEventListener('DOMContentLoaded', init);
