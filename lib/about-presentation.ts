import stack from '@/lib/technology-stack.json'
import packageInfo from '@/package.json'

/**
 * Pure presentation data/helpers of the About page.
 */

/** Developer contact. mailto: hands the address to the default mail client. */
export const DEVELOPER_EMAIL = 'Lahiji.ali@hyperfamili.com'

export const REPO = 'https://github.com/aliajeli/hyperfamily-it-app'

// Credit technologies used by the shipped application and its Windows build.
// Versioned labels follow the dependency manifest rather than handwritten majors.
export const technologies = (stack as any[]).map((entry) => {
  const version =
    (packageInfo as any).dependencies[entry.package] || (packageInfo as any).devDependencies[entry.package]
  const major = entry.showMajor && version?.match(/\d+/)?.[0]
  return { ...entry, name: major ? `${entry.name} ${major}` : entry.name }
})

/** 183807865 -> "175.3 MB". Sizes are shown in the units users recognise. */
export function formatBytes(bytes: any) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let size = value
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(index === 0 ? 0 : size >= 100 ? 0 : 1)} ${units[index]}`
}

/** 95 -> "1m 35s", used for the estimated time remaining. */
export function formatDuration(seconds: any) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value < 60) return `${Math.round(value)}s`
  const minutes = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
