// EA888 LAB platform layer (bundled by tools/build_web.py into build/web/platform.js).
// - patchHtml(): targeted DOM updates instead of replacing whole pages, so scroll position, focus,
//   running CSS animations and canvases survive a re-render.
// - native: the Android bridge (window.EA888Native) with browser fallbacks.
import morphdom from 'morphdom';

const TEXT_INPUTS = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password', '']);

function isEditing(el) {
  if (el !== document.activeElement) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_INPUTS.has((el.getAttribute('type') || '').toLowerCase());
}

/** Morph `target`'s children to `html`. Falls back to innerHTML if morphing throws. */
export function patchHtml(target, html) {
  if (!target) return;
  const next = target.cloneNode(false);
  next.innerHTML = html;
  try {
    morphdom(target, next, {
      childrenOnly: true,
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.isEqualNode(toEl)) return false;
        // Never overwrite what the player is typing right now.
        if (isEditing(fromEl)) return false;
        // Canvas size attributes are set by the drawing code; keep them so the picture is not cleared.
        if (fromEl.tagName === 'CANVAS') {
          toEl.width = fromEl.width;
          toEl.height = fromEl.height;
        }
        return true;
      }
    });
  } catch (e) {
    target.innerHTML = html;
  }
}

const bridge = typeof window !== 'undefined' ? window.EA888Native : null;
let pendingSave = null;
let pendingOpen = null;

window.__ea888OnFileSaved = ok => { const r = pendingSave; pendingSave = null; r?.(!!ok); };
window.__ea888OnFileOpened = text => { const r = pendingOpen; pendingOpen = null; r?.(typeof text === 'string' ? text : null); };

export const native = {
  available: !!bridge,
  version: bridge ? String(bridge.appVersion()) : '',
  haptic(ms) {
    try {
      if (bridge) bridge.haptic(Math.round(ms));
      else navigator.vibrate?.(ms);
    } catch (e) { /* haptics are optional */ }
  },
  keepScreenOn(on) {
    try { bridge?.keepScreenOn(!!on); } catch (e) { /* optional */ }
  },
  /** Save text through the system "save as" dialog (Android) or a download (browser). Resolves true when written. */
  saveFile(name, text) {
    if (bridge) {
      return new Promise(resolve => { pendingSave = resolve; bridge.saveFile(name, text); });
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  },
  /** Pick a file and resolve its text, or null when cancelled. */
  openFile() {
    if (bridge) {
      return new Promise(resolve => { pendingOpen = resolve; bridge.openFile(); });
    }
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json,text/plain' });
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        file.text().then(resolve, () => resolve(null));
      };
      input.click();
    });
  }
};

window.EA888Platform = { patchHtml, native };
