// Renderer-wide ambient types introduced by the TypeScript migration.

// The desktop app injects this bridge via the preload script; the companion
// app injects an HTTP-backed equivalent. Absent in plain browser demo mode.
interface Window {
  hyperfamily?: any
}
