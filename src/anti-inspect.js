const ANTI_INSPECT_INSTALLED_KEY = '__mermaid_studio_anti_inspect_installed__';
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isDevtoolsShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  if (key === 'f12') return true;

  const cmdOrCtrl = event.metaKey || event.ctrlKey;
  if (!cmdOrCtrl) return false;

  if (event.shiftKey && ['i', 'j', 'c'].includes(key)) return true;
  if (event.altKey && key === 'i') return true;
  if (!event.shiftKey && !event.altKey && key === 'u') return true;
  return false;
}

function toElement(target) {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function isMonacoTarget(target) {
  const element = toElement(target);
  return Boolean(element?.closest('.monaco-editor'));
}

function isTextLikeInput(element) {
  if (!(element instanceof HTMLInputElement)) return false;
  const type = String(element.type || 'text').toLowerCase();
  return !NON_TEXT_INPUT_TYPES.has(type);
}

function shouldAllowContextMenu(target) {
  const element = toElement(target);
  if (!element) return false;

  if (isMonacoTarget(target)) return true;

  const editable = element.closest(
      'textarea, input, [contenteditable=""], [contenteditable="true"]',
  );
  if (!editable) return false;

  if (editable instanceof HTMLTextAreaElement) return true;
  if (editable instanceof HTMLInputElement) return isTextLikeInput(editable);
  return editable instanceof HTMLElement && editable.isContentEditable;
}

export function installAntiInspect() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[ANTI_INSPECT_INSTALLED_KEY]) return;
  window[ANTI_INSPECT_INSTALLED_KEY] = true;

  document.addEventListener('contextmenu', (event) => {
    if (shouldAllowContextMenu(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (isMonacoTarget(event.target)) return;
    if (!isDevtoolsShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
}
