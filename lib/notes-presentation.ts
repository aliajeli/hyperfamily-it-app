import { AlertTriangle, ChevronsUp, Minus } from 'lucide-react'

/**
 * Pure presentation helpers of the notes page, kept free of React state so
 * both the components and the tests can use them.
 */

export const blankNote = { id: null, name: '', body: '', pinned: 0, color: 'default', priority: 0, tags: [] }

/**
 * Note colours are stored by name, not as a hex value, so every theme renders
 * its own shade of each one and a note keeps its meaning after a theme change.
 */
export const NOTE_COLORS = [
  {
    id: 'default',
    label: 'Neutral',
    swatch: 'rgb(var(--muted))',
    tint: 'rgb(var(--canvas))',
    edge: 'rgb(var(--border))'
  },
  { id: 'red', label: 'Red', swatch: '#BF616A', tint: 'rgba(191,97,106,.12)', edge: 'rgba(191,97,106,.5)' },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#EBCB8B',
    tint: 'rgba(235,203,139,.14)',
    edge: 'rgba(235,203,139,.55)'
  },
  {
    id: 'green',
    label: 'Green',
    swatch: '#A3BE8C',
    tint: 'rgba(163,190,140,.14)',
    edge: 'rgba(163,190,140,.55)'
  },
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#88C0D0',
    tint: 'rgba(136,192,208,.14)',
    edge: 'rgba(136,192,208,.55)'
  },
  {
    id: 'purple',
    label: 'Purple',
    swatch: '#B48EAD',
    tint: 'rgba(180,142,173,.14)',
    edge: 'rgba(180,142,173,.55)'
  }
]

export const colorOf = (id: any) => NOTE_COLORS.find((entry) => entry.id === id) || NOTE_COLORS[0]

/** Three levels is enough to triage by and few enough to scan at a glance. */
export const PRIORITIES: any[] = [
  { id: 0, label: 'Normal', short: 'Normal', icon: Minus, tone: 'rgb(var(--muted))' },
  { id: 1, label: 'Important', short: 'Important', icon: ChevronsUp, tone: '#EBCB8B' },
  { id: 2, label: 'Critical', short: 'Critical', icon: AlertTriangle, tone: '#BF616A' }
]

export const priorityOf = (value: any) =>
  PRIORITIES.find((entry) => entry.id === Number(value)) || PRIORITIES[0]

export const preview = (body: any) => (body || '').replace(/\s+/g, ' ').trim().slice(0, 72) || 'Empty note'

/**
 * Tags live in their own column (v2.0.16) — adding one never touches the note
 * body. The pattern below only extracts #hashtags that older notes still
 * carry inside their text, so nothing already written loses its tags.
 */
const TAG_PATTERN = /#[A-Za-z0-9_\u00C0-\u024F-]{1,40}/g

export const normalizeTags = (value: any) => {
  try {
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === 'string') return JSON.parse(value || '[]')
    return []
  } catch {
    return []
  }
}

export const sanitizeTag = (tag: any) => String(tag).replace(/^#+/, '').trim().toLowerCase().slice(0, 40)

export const tagsOfBody = (body: any) => [
  ...new Set(((body || '').match(TAG_PATTERN) || []).map((tag) => tag.toLowerCase()))
]

/** A note's full tag set: the stored tags plus any legacy body hashtags. */
export const noteTags = (note: any) => [
  ...new Set([...normalizeTags(note?.tags).map(sanitizeTag).filter(Boolean), ...tagsOfBody(note?.body)])
]

/** Chips read as hashtags even though tags are stored without the '#'. */
export const displayTag = (tag: any) => (String(tag).startsWith('#') ? tag : `#${tag}`)

export const when = (value: any) => {
  if (!value) return ''
  const date = new Date(String(value).includes('T') ? value : `${value}Z`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
