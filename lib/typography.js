/**
 * Application typography: the font catalogue, the five configurable text
 * groups, and the CSS-variable plumbing that applies them.
 *
 * Only fonts that ship with Windows (plus the generic system stacks) are
 * offered, because the app runs offline on branch machines and a webfont would
 * silently fall back to something else.
 */

export const MONO_FONTS = [
  { id: 'ui-monospace', label: 'System monospace', stack: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", monospace' },
  { id: 'cascadia', label: 'Cascadia Mono', stack: '"Cascadia Mono", "Cascadia Code", Consolas, monospace' },
  { id: 'consolas', label: 'Consolas', stack: 'Consolas, "Lucida Console", monospace' },
  { id: 'courier', label: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { id: 'lucida', label: 'Lucida Console', stack: '"Lucida Console", Monaco, monospace' },
  { id: 'dejavu', label: 'DejaVu Sans Mono', stack: '"DejaVu Sans Mono", "Liberation Mono", monospace' }
]

export const UI_FONTS = [
  { id: '', label: 'Application default', stack: '' },
  { id: 'system', label: 'System UI', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'segoe', label: 'Segoe UI', stack: '"Segoe UI", system-ui, sans-serif' },
  { id: 'calibri', label: 'Calibri', stack: 'Calibri, Candara, "Segoe UI", sans-serif' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Verdana, sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', stack: '"Trebuchet MS", Tahoma, sans-serif' },
  ...MONO_FONTS.map((font) => ({ ...font, label: `${font.label} (mono)` }))
]

/**
 * The five groups the user asked for. Each owns a CSS variable pair that the
 * stylesheet consumes, so changing a group restyles every matching element.
 */
export const FONT_GROUPS = [
  { id: 'header', label: 'Header', variable: '--font-header', sizeVariable: '--font-header-scale', description: 'Page titles and the top bar', sample: 'Application settings' },
  { id: 'title', label: 'Title', variable: '--font-title', sizeVariable: '--font-title-scale', description: 'Card and section headings', sample: 'FortiClient SSL VPN' },
  { id: 'text', label: 'Text', variable: '--font-text', sizeVariable: '--font-text-scale', description: 'Body copy, labels and buttons', sample: 'The quick brown fox jumps over the lazy dog.' },
  { id: 'info', label: 'Info', variable: '--font-info', sizeVariable: '--font-info-scale', description: 'Hints, captions and helper text', sample: 'Credentials are encrypted with Windows DPAPI.' },
  { id: 'mono', label: 'Monospace', variable: '--font-mono', sizeVariable: '--font-mono-scale', description: 'IP addresses, ports and console text', sample: '10.40.5.14:8291 — Gi1/0/24' }
]

export const SCALE_MIN = 50
export const SCALE_MAX = 200
export const SCALE_STEP = 5

/** Rounds an arbitrary number onto the 50–200 %, step-5 grid the UI exposes. */
export function normalizeScale(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 100
  const stepped = Math.round(number / SCALE_STEP) * SCALE_STEP
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, stepped))
}

/** Resolves a stored font id to a CSS font stack; unknown ids fall back to ''. */
export function fontStack(id, catalogue = UI_FONTS) {
  if (!id) return ''
  const found = catalogue.find((font) => font.id === id)
  return found ? found.stack : ''
}

export function monoStack(id) {
  return fontStack(id, MONO_FONTS) || MONO_FONTS[0].stack
}

export const TERMINAL_FONT_SIZE_MIN = 8
export const TERMINAL_FONT_SIZE_MAX = 16

export function normalizeTerminalFontSize(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 13
  return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(number)))
}

/**
 * Writes the typography settings onto the document root. Everything is applied
 * as CSS variables so no component needs to know a font was changed.
 *
 * The interface scale is applied as the root font size (16px = 100 %), which
 * scales every rem-based dimension — spacing, radii and type together — instead
 * of only making the text bigger.
 */
export const TYPOGRAPHY_STORAGE_KEY = 'hyperfamily.typography'

/** The subset of settings that describes typography, in storage form. */
export function typographySnapshot(settings = {}) {
  const snapshot = { ui_scale: normalizeScale(settings.ui_scale ?? 100) }
  for (const group of FONT_GROUPS) {
    snapshot[`font_${group.id}_family`] = settings[`font_${group.id}_family`] || ''
    snapshot[`font_${group.id}_size`] = normalizeScale(settings[`font_${group.id}_size`] ?? 100)
  }
  return snapshot
}

/**
 * Caches typography in localStorage so the boot script in app/layout.js can
 * restore it before the first paint, exactly as the theme is restored.
 */
export function rememberTypography(settings) {
  try { localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(typographySnapshot(settings))) } catch { /* storage may be unavailable */ }
}

export function readRememberedTypography() {
  try {
    const raw = localStorage.getItem(TYPOGRAPHY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function applyTypography(settings = {}, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return
  const scale = normalizeScale(settings.ui_scale ?? 100)
  root.style.fontSize = `${(16 * scale) / 100}px`
  root.dataset.uiScale = String(scale)

  for (const group of FONT_GROUPS) {
    const catalogue = group.id === 'mono' ? MONO_FONTS : UI_FONTS
    const stack = fontStack(settings[`font_${group.id}_family`], catalogue)
    if (stack) root.style.setProperty(group.variable, stack)
    else root.style.removeProperty(group.variable)

    const size = normalizeScale(settings[`font_${group.id}_size`] ?? 100)
    root.style.setProperty(group.sizeVariable, String(size / 100))
  }
}
