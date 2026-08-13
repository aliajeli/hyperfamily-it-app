'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TerminalEmulator } from '@/lib/terminal-emulator'

const CHAR_RATIO = 0.6 // width/height ratio of the monospace cell

const ANSI_HEX = {
  'ansi-black': '#3B4252', 'ansi-red': '#BF616A', 'ansi-green': '#A3BE8C', 'ansi-yellow': '#EBCB8B',
  'ansi-blue': '#81A1C1', 'ansi-magenta': '#B48EAD', 'ansi-cyan': '#88C0D0', 'ansi-white': '#E5E9F0',
  'ansi-bright-black': '#4C566A', 'ansi-bright-red': '#D08770', 'ansi-bright-green': '#B9D2A1',
  'ansi-bright-yellow': '#F0D399', 'ansi-bright-blue': '#9DB8D4', 'ansi-bright-magenta': '#C7A5C2',
  'ansi-bright-cyan': '#A3D5E0', 'ansi-bright-white': '#ECEFF4'
}

// Emulator attributes carry CSS-variable identifiers (ansi-red, ansi-bright-cyan…)
// so the palette follows the app theme; hex/rgb values pass straight through.
const colorFor = (value) => {
  if (!value) return null
  if (ANSI_HEX[value]) return `var(--${value}, ${ANSI_HEX[value]})`
  return value
}

/**
 * Renders a live terminal session. The screen buffer lives in a ref so device
 * output never triggers a React reconciliation per byte; a repaint is scheduled
 * on an animation frame instead.
 */
export default function TerminalScreen({ session, api, fontSize = 13, onSizeChange }) {
  const holderRef = useRef(null)
  const screenRef = useRef(null)
  const emulatorRef = useRef(null)
  const frameRef = useRef(0)
  const [revision, setRevision] = useState(0)
  const [size, setSize] = useState({ cols: 80, rows: 24 })
  const [followTail, setFollowTail] = useState(true)

  if (!emulatorRef.current) emulatorRef.current = new TerminalEmulator(80, 24)

  const repaint = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      setRevision((value) => value + 1)
    })
  }, [])

  // Measure the container and derive the character grid from the font metrics.
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
  }, [fontSize])

  useEffect(() => {
    emulatorRef.current.resize(size.cols, size.rows)
    repaint()
    onSizeChange?.(size)
    if (session?.sessionId) api.resize({ sessionId: session.sessionId, cols: size.cols, rows: size.rows }).catch(() => {})
  }, [size, session?.sessionId, api, onSizeChange, repaint])

  // Device output stream.
  useEffect(() => {
    if (!session?.sessionId) return undefined
    const unsubscribe = api.onData((payload) => {
      if (payload.sessionId !== session.sessionId) return
      emulatorRef.current.write(payload.data)
      repaint()
    })
    return unsubscribe
  }, [session?.sessionId, api, repaint])

  useEffect(() => {
    emulatorRef.current.reset()
    emulatorRef.current.resize(size.cols, size.rows)
    repaint()
    // A new session id means a brand-new screen.
  }, [session?.sessionId])

  useEffect(() => {
    if (!followTail) return
    const node = screenRef.current
    if (node) node.scrollTop = node.scrollHeight
  })

  const send = useCallback((data) => {
    if (!session?.sessionId || session.state === 'closed') return
    api.write({ sessionId: session.sessionId, data }).catch(() => {})
  }, [api, session?.sessionId, session?.state])

  const onKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && window.getSelection()?.toString()) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return

    const map = {
      Enter: '\r', Backspace: '\u007f', Tab: '\t', Escape: '\u001b',
      ArrowUp: '\u001b[A', ArrowDown: '\u001b[B', ArrowRight: '\u001b[C', ArrowLeft: '\u001b[D',
      Home: '\u001b[H', End: '\u001b[F', Delete: '\u001b[3~', PageUp: '\u001b[5~', PageDown: '\u001b[6~'
    }

    if (map[event.key]) { event.preventDefault(); send(map[event.key]); setFollowTail(true); return }
    if (event.ctrlKey && /^[a-z]$/i.test(event.key)) {
      event.preventDefault()
      send(String.fromCharCode(event.key.toLowerCase().charCodeAt(0) - 96))
      setFollowTail(true)
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.altKey) {
      event.preventDefault()
      send(event.key)
      setFollowTail(true)
    }
  }

  const onPaste = (event) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text')
    if (text) { send(text.replace(/\r?\n/g, '\r')); setFollowTail(true) }
  }

  // `revision` is bumped by repaint(); it is the dependency that makes this
  // memo recompute after the emulator buffer changes.
  const snapshot = useMemo(() => emulatorRef.current.snapshot(), [size, revision])
  const lineHeight = Math.round(fontSize * 1.42)

  return (
    <div ref={holderRef} className="relative h-full w-full overflow-hidden rounded-xl border bg-[rgb(var(--canvas))]">
      <div
        ref={screenRef}
        role="textbox"
        aria-label="Terminal"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onScroll={(event) => {
          const node = event.currentTarget
          setFollowTail(node.scrollHeight - node.scrollTop - node.clientHeight < 24)
        }}
        className="h-full w-full cursor-text overflow-y-auto px-3 py-2 font-mono outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--primary)/.5)]"
        style={{ fontSize, lineHeight: `${lineHeight}px`, fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", monospace' }}
      >
        {snapshot.rows.map((runs, rowIndex) => (
          <div key={rowIndex} className="whitespace-pre" style={{ height: lineHeight }}>
            {runs.map((run, runIndex) => {
              const { attr } = run
              const foreground = colorFor(attr.inverse ? attr.bg : attr.fg)
              const background = colorFor(attr.inverse ? attr.fg : attr.bg)
              const style = {
                color: foreground || (attr.inverse ? 'rgb(var(--canvas))' : undefined),
                background: background || (attr.inverse ? 'rgb(var(--text))' : undefined),
                fontWeight: attr.bold ? 700 : undefined,
                fontStyle: attr.italic ? 'italic' : undefined,
                textDecoration: attr.underline ? 'underline' : undefined,
                opacity: attr.dim ? 0.68 : undefined
              }
              return <span key={runIndex} style={style}>{run.text}</span>
            })}
          </div>
        ))}
      </div>

      {/* Cursor is drawn as an overlay so it never disturbs the text runs. */}
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

      {!followTail && (
        <button
          type="button"
          onClick={() => { setFollowTail(true); if (screenRef.current) screenRef.current.scrollTop = screenRef.current.scrollHeight }}
          className="absolute bottom-3 right-3 rounded-lg border bg-[rgb(var(--surface))] px-2.5 py-1 text-[10px] font-bold shadow-lg"
        >
          Jump to latest
        </button>
      )}
    </div>
  )
}
