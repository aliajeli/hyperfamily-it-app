/**
 * The Famili mark.
 *
 * Symbol only — no wordmark. It is the cart glyph from the Famili logo: the
 * red loop with its stroke rising to the right, riding on two teal wheels.
 * Drawn as geometry rather than shipped as a bitmap so it stays crisp at every
 * size, follows `currentColor`-free brand colours in both themes, and can be
 * inlined anywhere without a network request.
 *
 * Brand colours are sampled from the supplied artwork: red #CF171F, teal #00B1C5.
 */
export default function BrandMark({ className = 'h-10 w-10', title = 'Famili' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        <linearGradient id="famili-red" x1="12" y1="12" x2="50" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EF3F23" />
          <stop offset=".55" stopColor="#CF171F" />
          <stop offset="1" stopColor="#B5121A" />
        </linearGradient>
      </defs>

      {/* The cart body: an open loop whose stroke sweeps up to the right,
          exactly as the original glyph does. */}
      <g stroke="url(#famili-red)" strokeWidth="7.6" strokeLinecap="round" fill="none">
        <path d="M43 8 L30.5 30" />
        <path d="M31.6 20.8 A11.2 11.2 0 1 0 32 32.2 L48 32.2" />
      </g>

      {/* The two teal wheels. */}
      <g fill="none" stroke="#00B1C5" strokeWidth="3.8">
        <circle cx="25" cy="53.5" r="4.3" />
        <circle cx="42" cy="53.5" r="4.3" />
      </g>
    </svg>
  )
}
