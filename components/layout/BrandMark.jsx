/**
 * The Famili mark: a minimal shopping trolley.
 *
 * Symbol only — no wordmark. Drawn as open geometry rather than a filled
 * silhouette so it stays light at small sizes and crisp at any resolution.
 *
 * Brand palette (fixed, not theme-driven — a logo must not change colour with
 * the interface theme):
 *   #d4211f  trolley body and handle
 *   #00b1c5  wheels
 */
export const BRAND_RED = '#d4211f'
export const BRAND_TEAL = '#00b1c5'
export const BRAND_GREY = '#939598'

export default function BrandMark({ className = 'h-10 w-10', title = 'Famili' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label={title}>
      {/* Handle, basket and lower rail drawn as one continuous stroke weight so
          the mark reads as a single object rather than assembled parts. */}
      <g
        fill="none"
        stroke={BRAND_RED}
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.5 14.5 h6.6 l3 8.8" />
        <path d="M15.6 23.3 H56 l-5.2 15.8 H21.2" />
        <path d="M15.6 23.3 l6.6 20 h26.4" />
      </g>

      <g fill={BRAND_TEAL}>
        <circle cx="27" cy="52.5" r="4.8" />
        <circle cx="46" cy="52.5" r="4.8" />
      </g>
    </svg>
  )
}
