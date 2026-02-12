const ANTI_INSPECT_INSTALLED_KEY = '__mermaid_studio_anti_inspect_installed__';

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

export function installAntiInspect() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[ANTI_INSPECT_INSTALLED_KEY]) return;
  window[ANTI_INSPECT_INSTALLED_KEY] = true;

  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!isDevtoolsShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
}
