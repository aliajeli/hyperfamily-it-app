'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A minimized run keeps going; this pill brings its narration dialog back.
 * `kind` picks the accent colour: 'install' (nord-14) or 'agent' (primary).
 */
export default function RunningPill({ kind, label, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'no-drag fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-full border bg-[rgb(var(--surface)/.92)] px-3.5 py-2 text-2xs font-bold text-[rgb(var(--text))] shadow-xl backdrop-blur transition',
        kind === 'agent'
          ? 'border-[rgb(var(--primary)/.45)] hover:border-[rgb(var(--primary))]'
          : 'border-nord-14/50 hover:border-nord-14'
      )}
    >
      <Loader2
        size={14}
        className={cn('animate-spin', kind === 'agent' ? 'text-[rgb(var(--primary))]' : 'text-nord-14')}
      />
      {label}
    </button>
  )
}
