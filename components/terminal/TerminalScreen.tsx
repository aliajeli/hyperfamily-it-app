'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TerminalEmulator } from '@/lib/terminal-emulator'
import { commonPrefix, completions, currentWord, tokenize } from '@/lib/terminal-syntax'

const CHAR_RATIO = 0.6

const ANSI_HEX: any = {
  'ansi-black': '#3B4252',
  'ansi-red': '#BF616A',
  'ansi-green': '#A3BE8C',
  'ansi-yellow': '#EBCB8B',
  'ansi-blue': '#81A1C1',
  'ansi-magenta': '#B48EAD',
  'ansi-cyan': '#88C0D0',
  'ansi-white': '#E5E9F0',
  'ansi-bright-black': '#4C566A',
  'ansi-bright-red': '#D08770',
  'ansi-bright-green': '#B9D2A1',
  'ansi-bright-yellow': '#F0D399',
  'ansi-bright-blue': '#9DB8D4',
  'ansi-bright-magenta': '#C7A5C2',
  'ansi-bright-cyan': '#A3D5E0',
  'ansi-bright-white': '#ECEFF4'
}

const SYNTAX_STYLE: any = {
  prompt: { color: 'rgb(var(--muted))', fontWeight: 700 },
  command: { color: 'var(--ansi-cyan, #88C0D0)', fontWeight: 600 },
  config: { color: 'var(--ansi-magenta, #B48EAD)', fontWeight: 600 },
  destructive: { color: 'var(--ansi-red, #BF616A)', fontWeight: 700 },
  keyword: { color: 'var(--ansi-blue, #81A1C1)' },
  address: { color: 'var(--ansi-green, #A3BE8C)' },
  interface: { color: 'var(--ansi-green, #A3BE8C)' },
  number: { color: 'var(--ansi-yellow, #EBCB8B)' },
  string: { color: 'var(--ansi-yellow, #EBCB8B)' },
  flag: { color: 'var(--ansi-bright-black, #4C566A)' },
  comment: { color: 'rgb(var(--muted))', fontStyle: 'italic' }
}

const colorFor = (value: any) => {
  if (!value) return null
  if (ANSI_HEX[value]) return `var(--${value}, ${ANSI_HEX[value]})`
  return value
}

export const DEFAULT_TERMINAL_FONT =
  'ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", monospace'

export default function TerminalScreen({
  session,
  api,
  fontSize = 11,
  fontFamily = DEFAULT_TERMINAL_FONT,
  highlight = true,
  onSizeChange
}: any) {
  const holderRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const emulatorRef = useRef<any>(null)
  const frameRef = useRef<number>(0)
  const inputRef = useRef('')
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null)
  const [revision, setRevision] = useState(0)
  const [size, setSize] = useState({ cols: 80, rows: 24 })
  const [followTail, setFollowTail] = useState(true)
  const [picker, setPicker] = useState<any>(null)

  if (!emulatorRef.current) emulatorRef.current = new TerminalEmulator(80, 24)

  const repaint = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      setRevision((value) => value + 1)
    }) as any
  }, [])

  useLayoutEffect(() => {
    const holder = holderRef.current
    if (!holder) return undefined
    const measure = () => {
      const lineHeight = Math.round(fontSize * 1.42)
      const charWidth = fontSize * CHAR_RATIO
      const cols = Math.max(20, Math.floor((holder.clientWidth - 24) / charWidth))
      const rows = Math.max(6, Math.floor((holder.clientHeight - 16) / lineHeight))
      setSize((previous) => (previous.cols === cols && previous.rows === rows ? previous : { cols, rows }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(holder)
    return () => observer.disconnect()
  }, [fontSize, fontFamily])

  useEffect(() => {
    emulatorRef.current.resize(size.cols, size.rows)
    repaint()
    onSizeChange?.(size)
    if (session?.sessionId)
      api.resize({ sessionId: session.sessionId, cols: size.cols, rows: size.rows }).catch(() => {})
  }, [size, session?.sessionId, api, onSizeChange, repaint])

  useEffect(() => {
    if (!session?.sessionId) return undefined
    const unsubscribe = api.onData((payload: any) => {
      if (payload.sessionId !== session.sessionId) return
      emulatorRef.current.write(payload.data)
      repaint()
    })
    return unsubscribe
  }, [session?.sessionId, api, repaint])

  useEffect(() => {
    emulatorRef.current.reset()
    emulatorRef.current.resize(size.cols, size.rows)
    inputRef.current = ''
    setPicker(null)
    repaint()
  }, [session?.sessionId])

  useEffect(() => {
    if (!followTail) return
    const node = screenRef.current
    if (node) node.scrollTop = node.scrollHeight
  })

  const send = useCallback(
    (data: string) => {
      if (!session?.sessionId || session.state === 'closed') return
      api.write({ sessionId: session.sessionId, data }).catch(() => {})
    },
    [api, session?.sessionId, session?.state]
  )

  const trackInput = useCallback((data: string) => {
    if (data === '\r' || data === '\u0003') {
      inputRef.current = ''
      return
    }
    if (data === '\u007f') {
      inputRef.current = inputRef.current.slice(0, -1)
      return
    }
    if (data.length === 1 && data >= ' ') inputRef.current += data
    else if (data.length > 1 && !data.startsWith('\u001b')) inputRef.current += data
  }, [])

  const transmit = useCallback(
    (data: string) => {
      trackInput(data)
      send(data)
      setFollowTail(true)
    },
    [send, trackInput]
  )

  const applyCompletion = useCallback(
    (word: string, whole = true) => {
      const typed = currentWord(inputRef.current)
      const suffix = word.slice(typed.length)
      const trailing = whole ? ' ' : ''
      if (word.slice(0, typed.length).toLowerCase() !== typed.toLowerCase()) {
        transmit('\u007f'.repeat(typed.length))
        transmit(word + trailing)
        return
      }
      if (suffix || trailing) transmit(suffix + trailing)
    },
    [transmit]
  )

  const focusTerminal = useCallback(() => {
    screenRef.current?.focus()
    // On mobile, focusing hidden textarea opens the OS keyboard
    setTimeout(() => hiddenInputRef.current?.focus(), 30)
  }, [])

  const onKeyDown = (event: any) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'c' &&
      window.getSelection()?.toString()
    )
      return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return

    if (picker) {
      if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault()
        applyCompletion(picker.items[picker.index])
        setPicker(null)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPicker((p: any) => ({ ...p, index: (p.index + 1) % p.items.length }))
        return
      }
      if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
        event.preventDefault()
        setPicker((p: any) => ({ ...p, index: (p.index - 1 + p.items.length) % p.items.length }))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setPicker(null)
        return
      }
    }

    if (event.ctrlKey && (event.key === ' ' || event.code === 'Space')) {
      event.preventDefault()
      const prefix = currentWord(inputRef.current)
      const items = completions(prefix)
      if (items.length) setPicker({ items: items.slice(0, 200), index: 0, prefix })
      return
    }

    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      const prefix = currentWord(inputRef.current)
      const items = completions(prefix)
      if (!items.length) {
        transmit('\t')
        return
      }
      if (items.length === 1) {
        applyCompletion(items[0])
        return
      }
      const shared = commonPrefix(items)
      if (shared.length > prefix.length) {
        applyCompletion(shared, false)
        return
      }
      setPicker({ items: items.slice(0, 200), index: 0, prefix })
      return
    }

    const map: any = {
      Enter: '\r',
      Backspace: '\u007f',
      Escape: '\u001b',
      ArrowUp: '\u001b[A',
      ArrowDown: '\u001b[B',
      ArrowRight: '\u001b[C',
      ArrowLeft: '\u001b[D',
      Home: '\u001b[H',
      End: '\u001b[F',
      Delete: '\u001b[3~',
      PageUp: '\u001b[5~',
      PageDown: '\u001b[6~',
      ' ': ' '
    }

    if (map[event.key] !== undefined) {
      event.preventDefault()
      transmit(map[event.key])
      return
    }
    if (event.ctrlKey && /^[a-z]$/i.test(event.key)) {
      event.preventDefault()
      const code = String.fromCharCode(event.key.toLowerCase().charCodeAt(0) - 96)
      transmit(code)
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.altKey) {
      event.preventDefault()
      transmit(event.key)
      if (picker) {
        const prefix = currentWord(inputRef.current)
        const items = completions(prefix)
        setPicker(items.length ? { items: items.slice(0, 200), index: 0, prefix } : null)
      }
    }
  }

  const onPaste = (event: any) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text')
    if (text) {
      transmit(text.replace(/\r?\n/g, '\r'))
    }
  }

  // Hidden textarea for mobile keyboard: captures typed text and forwards to terminal
  const handleHiddenInput = (e: any) => {
    const val = e.target.value
    if (!val) return
    // Forward each character, handling newline as Enter
    for (const ch of val) {
      if (ch === '\n') transmit('\r')
      else transmit(ch)
    }
    e.target.value = ''
    // Keep focus
    setTimeout(() => hiddenInputRef.current?.focus(), 10)
  }

  const handleHiddenKeyDown = (e: any) => {
    // On mobile, the hidden textarea may receive Enter as newline
    if (e.key === 'Enter') {
      e.preventDefault()
      transmit('\r')
      e.target.value = ''
    } else if (e.key === 'Backspace') {
      // Let onChange handle? But also send backspace
      // We handle via input event, but also ensure backspace works when textarea empty
      if (!e.target.value) {
        e.preventDefault()
        transmit('\u007f')
      }
    } else if (e.key === ' ') {
      // Space for --More-- pagination
      e.preventDefault()
      transmit(' ')
      e.target.value = ''
    }
  }

  const snapshot = useMemo(() => emulatorRef.current.snapshot(), [size, revision])
  const lineHeight = Math.round(fontSize * 1.42)

  // Detect --More-- pagination prompt in last rows
  const morePrompt = useMemo(() => {
    const lastRows = snapshot.rows
      .slice(-3)
      .map((runs: any) => runs.map((r: any) => r.text).join(''))
      .join(' ')
      .toLowerCase()
    if (
      lastRows.includes('--more--') ||
      lastRows.includes('-- more --') ||
      (lastRows.includes('more') && lastRows.includes('--'))
    )
      return true
    // Also check for Cisco style " --More-- " or "<--- More --->"
    const joined = snapshot.rows.map((runs: any) => runs.map((r: any) => r.text).join('')).join('\n')
    return /--\s*more\s*--/i.test(joined) || /<---\s*more\s*--->/i.test(joined)
  }, [snapshot])

  return (
    <div
      ref={holderRef}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-[rgb(var(--canvas))]"
    >
      <div
        ref={screenRef}
        role="textbox"
        aria-label="Terminal screen — tap to type, use keyboard for commands"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onClick={focusTerminal}
        onBlur={() => setPicker(null)}
        onScroll={(event) => {
          const node = event.currentTarget
          setFollowTail(node.scrollHeight - node.scrollTop - node.clientHeight < 24)
        }}
        className="min-h-0 flex-1 cursor-text overflow-y-auto px-3 py-2 font-mono outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--primary)/.5)]"
        style={{ fontSize, lineHeight: `${lineHeight}px`, fontFamily }}
      >
        {snapshot.rows.map((runs: any, rowIndex: number) => {
          const plain =
            highlight &&
            runs.every((run: any) => {
              const { attr } = run
              return !attr.fg && !attr.bg && !attr.inverse && !attr.underline
            })
          if (plain) {
            const text = runs.map((run: any) => run.text).join('')
            if (!text.trim())
              return (
                <div key={rowIndex} className="whitespace-pre" style={{ height: lineHeight }}>
                  {text}
                </div>
              )
            return (
              <div key={rowIndex} className="whitespace-pre" style={{ height: lineHeight }}>
                {tokenize(text).map((token: any, index: number) => (
                  <span key={index} style={SYNTAX_STYLE[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </div>
            )
          }
          return (
            <div key={rowIndex} className="whitespace-pre" style={{ height: lineHeight }}>
              {runs.map((run: any, runIndex: number) => {
                const { attr } = run
                const foreground = colorFor(attr.inverse ? attr.bg : attr.fg)
                const background = colorFor(attr.inverse ? attr.fg : attr.bg)
                const style: any = {
                  color: foreground || (attr.inverse ? 'rgb(var(--canvas))' : undefined),
                  background: background || (attr.inverse ? 'rgb(var(--text))' : undefined),
                  fontWeight: attr.bold ? 700 : undefined,
                  fontStyle: attr.italic ? 'italic' : undefined,
                  textDecoration: attr.underline ? 'underline' : undefined,
                  opacity: attr.dim ? 0.68 : undefined
                }
                return (
                  <span key={runIndex} style={style}>
                    {run.text}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>

      {session?.state === 'connected' && (
        <span
          aria-hidden
          className="pointer-events-none absolute animate-pulse rounded-[1px] bg-[rgb(var(--primary))]"
          style={{
            left: 12 + snapshot.cursor.x * fontSize * CHAR_RATIO,
            top: 8 + snapshot.cursor.y * lineHeight,
            width: Math.max(2, fontSize * CHAR_RATIO),
            height: lineHeight - 2,
            opacity: 0.55
          }}
        />
      )}

      {picker && (
        <div
          role="listbox"
          aria-label="Command suggestions"
          className="absolute z-20 max-h-56 w-56 overflow-y-auto rounded-xl border bg-[rgb(var(--surface))] p-1 shadow-2xl"
          style={{
            left: Math.min(
              12 + snapshot.cursor.x * fontSize * CHAR_RATIO,
              Math.max(12, (holderRef.current?.clientWidth || 320) - 236)
            ),
            top: Math.min(
              8 + (snapshot.cursor.y + 1) * lineHeight + 4,
              Math.max(8, (holderRef.current?.clientHeight || 240) - 232)
            )
          }}
        >
          <div className="px-2 pb-1 pt-0.5 text-xs font-bold uppercase tracking-widest text-[rgb(var(--muted))]">
            {picker.items.length} match{picker.items.length === 1 ? '' : 'es'}
            {picker.prefix ? ` for “${picker.prefix}”` : ''}
          </div>
          {picker.items.map((item: string, index: number) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={index === picker.index}
              onMouseDown={(event) => {
                event.preventDefault()
                applyCompletion(item)
                setPicker(null)
              }}
              onMouseEnter={() => setPicker((p: any) => (p ? { ...p, index } : p))}
              className={`block w-full truncate rounded-lg px-2 py-1 text-left font-mono text-2xs ${index === picker.index ? 'bg-[rgb(var(--primary)/.16)] text-[rgb(var(--primary))]' : 'text-[rgb(var(--text))]'}`}
            >
              <b>{item.slice(0, picker.prefix.length)}</b>
              {item.slice(picker.prefix.length)}
            </button>
          ))}
        </div>
      )}

      {!followTail && (
        <button
          type="button"
          onClick={() => {
            setFollowTail(true)
            if (screenRef.current) screenRef.current.scrollTop = screenRef.current.scrollHeight
          }}
          className="absolute bottom-14 right-3 rounded-lg border bg-[rgb(var(--surface))] px-2.5 py-1 text-xs font-bold shadow-lg"
        >
          Jump to latest
        </button>
      )}

      {/* --More-- pagination helper - floating bar for mobile and desktop */}
      {morePrompt && session?.state === 'connected' && (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-[rgb(var(--surface))] px-3 py-1.5 shadow-xl backdrop-blur">
          <span className="hidden text-2xs font-bold text-[rgb(var(--muted))] md:block">--More--</span>
          <button
            type="button"
            onClick={() => transmit(' ')}
            className="rounded-full bg-[rgb(var(--primary))] px-3 py-1 text-xs font-bold text-white hover:bg-[rgb(var(--primary-strong))]"
          >
            Space: next page
          </button>
          <button
            type="button"
            onClick={() => transmit('\r')}
            className="rounded-full border bg-[rgb(var(--canvas))] px-2.5 py-1 text-xs font-bold hover:bg-[rgb(var(--border)/.4)]"
          >
            Enter: next line
          </button>
          <button
            type="button"
            onClick={() => transmit('q')}
            className="rounded-full border bg-[rgb(var(--canvas))] px-2 py-1 text-xs hover:bg-[rgb(var(--border)/.4)]"
          >
            q
          </button>
        </div>
      )}

      {/* Hidden textarea that opens mobile keyboard when terminal is tapped - no visible input */}
      <textarea
        ref={hiddenInputRef}
        aria-label="Terminal input"
        onChange={handleHiddenInput}
        onKeyDown={handleHiddenKeyDown}
        className="absolute left-0 top-0 h-0 w-0 opacity-0"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
      />
    </div>
  )
}
