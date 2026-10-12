// Renderer-wide ambient types introduced by the TypeScript migration.

// The desktop app injects this bridge via the preload script. Absent in plain browser demo mode.
interface Window {
  hyperfamily?: any
}
