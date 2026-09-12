/**
 * Type scale.
 *
 * Every size is emitted as `calc(<px> * var(--font-<group>-scale))` instead of a
 * fixed px value, so the five groups in Settings → Fonts really resize the
 * interface instead of only the handful of hand-written CSS classes that used
 * to reference the variables. lib/typography.js writes those variables on
 * <html>; at the default scale of 1 each token renders at exactly its listed
 * pixel size, so an untouched install looks identical.
 *
 *   Header  3xl 2xl            page titles
 *   Title   xl lg sm base-ui   card/section headings and the page base size
 *   Text    base               body copy
 *   Info    2xs xs             labels, captions, table cells, hints
 *   Mono    inherits --font-mono; the terminal keeps its own size setting
 */
/* No lineHeight is attached on purpose: 60 elements pair a size with an
   explicit `leading-*` utility, and Tailwind's line-height from a fontSize
   entry is emitted after those utilities, so it would silently win. Sizes stay
   pure font-size and the leading utilities keep working exactly as before. */
const SCALED_FONT_SIZE = {
  '3xl': 'calc(1.875rem * var(--font-header-scale))',
  '2xl': 'calc(1.5rem * var(--font-header-scale))',
  xl: 'calc(1.25rem * var(--font-title-scale))',
  lg: 'calc(1.125rem * var(--font-title-scale))',
  // 13px: the size card headings and the page wrappers actually use.
  'base-ui': 'calc(.8125rem * var(--font-title-scale))',
  sm: 'calc(.8125rem * var(--font-title-scale))',
  base: 'calc(1rem * var(--font-text-scale))',
  '2xs': 'calc(.5rem * var(--font-info-scale))',
  xs: 'calc(.625rem * var(--font-info-scale))'
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-color-mode="dark"]'],
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontSize: SCALED_FONT_SIZE,
      colors: {
        nord: {
          0: '#2E3440', 1: '#3B4252', 2: '#434C5E', 3: '#4C566A',
          4: '#D8DEE9', 5: '#E5E9F0', 6: '#ECEFF4', 7: '#8FBCBB',
          8: '#88C0D0', 9: '#81A1C1', 10: '#5E81AC', 11: '#BF616A',
          12: '#D08770', 13: '#EBCB8B', 14: '#A3BE8C', 15: '#B48EAD'
        }
      },
      boxShadow: {
        glass: '0 18px 50px rgba(46,52,64,.12)',
        glow: '0 0 0 4px rgba(136,192,208,.15)'
      },
      keyframes: {
        'pulse-ring': { '0%,100%': { transform: 'scale(.94)', opacity: '1' }, '50%': { transform: 'scale(1)', opacity: '.65' } },
        float: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(28px,-34px,0)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } }
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s ease-in-out infinite',
        float: 'float 20s ease-in-out infinite',
        shake: 'shake .35s ease-in-out'
      }
    }
  },
  plugins: []
}
