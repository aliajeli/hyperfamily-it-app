/**
 * The Famili mark: a shopping trolley reduced to two shapes.
 *
 * Symbol only — no wordmark. The basket is one solid gradient body with the
 * handle sweeping out of it, and the wheels are the single accent colour, so
 * the whole mark resolves into a recognisable silhouette at 16px while the
 * gradients give it depth at hero sizes.
 *
 * Brand palette (fixed, not theme-driven — a logo must not change colour with
 * the interface theme):
 *   #d4211f  trolley body and handle (shaded #f8544a → #a8101a)
 *   #00b1c5  wheels (shaded #2ad0e0 → #0096ab)
 *
 * `id` values inside an inline SVG are document-global, so the gradients are
 * suffixed with a per-instance token; two marks on one page would otherwise
 * share (and fight over) the same definitions.
 */
import { useId } from 'react'

export const BRAND_RED = '#d4211f'
export const BRAND_TEAL = '#00b1c5'
export const BRAND_GREY = '#939598'

export default function BrandMark({ className = 'h-10 w-10', title = 'Famili' }) {
  const token = useId().replace(/[^a-zA-Z0-9]/g, '')
  const body = `brand-body-${token}`
  const wheel = `brand-wheel-${token}`

  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        <linearGradient id={body} x1="14" y1="15" x2="52" y2="47" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f8544a" />
          <stop offset=".55" stopColor={BRAND_RED} />
          <stop offset="1" stopColor="#a8101a" />
        </linearGradient>
        <linearGradient id={wheel} x1="24" y1="47" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2ad0e0" />
          <stop offset="1" stopColor="#0096ab" />
        </linearGradient>
      </defs>

      {/* Handle: a single stroke that appears to grow out of the basket wall. */}
      <path d="M4.8 11.6h4.1a6.2 6.2 0 0 1 6 4.6l1.05 3.9" fill="none" stroke={`url(#${body})`} strokeWidth="5.2" strokeLinecap="round" />

      {/* Basket: one solid tapered body — far more legible when small than an
          outlined cart, whose interior lines collapse into mush below 24px. */}
      <path d="M18.1 20.6h36.4a3.6 3.6 0 0 1 3.44 4.66l-3.9 12.6a6.4 6.4 0 0 1-6.12 4.52H26.7a6.4 6.4 0 0 1-6.12-4.46l-3.94-12.6a3.6 3.6 0 0 1 3.46-4.72Z" fill={`url(#${body})`} />

      {/* Slats knocked out of the body keep it from reading as a plain wedge. */}
      <g fill="#fff" fillOpacity=".88">
        <rect x="26.4" y="26.2" width="3.1" height="11" rx="1.55" />
        <rect x="34.9" y="26.2" width="3.1" height="11" rx="1.55" />
        <rect x="43.4" y="26.2" width="3.1" height="11" rx="1.55" />
      </g>

      <g fill={`url(#${wheel})`}>
        <circle cx="28.6" cy="52.6" r="5.2" />
        <circle cx="47.4" cy="52.6" r="5.2" />
      </g>
    </svg>
  )
}
