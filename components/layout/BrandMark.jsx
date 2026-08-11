export default function BrandMark({ className = 'h-10 w-10' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="HyperFamily">
      <defs>
        <linearGradient id="hf-gradient" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#88C0D0" />
          <stop offset=".5" stopColor="#5E81AC" />
          <stop offset="1" stopColor="#B48EAD" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="18" fill="url(#hf-gradient)" />
      <path d="M18 19v26M46 19v26M19 32h26" stroke="white" strokeWidth="7" strokeLinecap="round" />
      <circle cx="32" cy="32" r="4.5" fill="#EBCB8B" stroke="white" strokeWidth="2" />
    </svg>
  )
}
