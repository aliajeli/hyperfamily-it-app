'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Check, Link as LinkIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'

export default function BranchList({ branches, selectedBranchId, deviceCounts = {}, onSelect, onEdit, onDelete, onAdd }) {
  if (!branches.length) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="Create your first branch"
        description="A branch must exist before equipment can be added. Start with the branch identity, links, and contacts."
        action={<Button onClick={onAdd}><Plus size={15} />Add first branch</Button>}
      />
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {branches.map((branch, index) => {
          const selected = branch.id === selectedBranchId
          return (
            <motion.article
              layout
              key={branch.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ delay: index * 0.025 }}
              className={`directory-branch-card group relative overflow-hidden rounded-2xl border transition-all ${selected ? 'border-[rgb(var(--primary)/.48)] bg-[rgb(var(--primary)/.09)] shadow-md' : 'bg-[rgb(var(--surface)/.62)] hover:border-[rgb(var(--primary)/.25)] hover:bg-[rgb(var(--surface))]'}`}
            >
              <button type="button" onClick={() => onSelect(branch)} className="block w-full p-3.5 pr-20 text-left" aria-pressed={selected}>
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${selected ? 'bg-[rgb(var(--primary))] text-white shadow-md' : 'bg-[rgb(var(--border)/.55)] text-[rgb(var(--muted))]'}`}>
                    {selected ? <Check size={17} /> : <Building2 size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black tracking-[0.025em]">{branch.name}</span>
                    <span className="mt-1 flex min-w-0 items-center gap-2 text-[8px] font-semibold text-[rgb(var(--muted))]">
                      <span className="rounded-md bg-[rgb(var(--border)/.55)] px-1.5 py-0.5 font-mono font-bold">{branch.code}</span>
                      <span className="truncate">{deviceCounts[branch.id] || 0} devices</span>
                    </span>
                    {(branch.link1 || branch.link2) && <span className="mt-1.5 flex items-center gap-1 truncate text-[8px] text-[rgb(var(--muted))]"><LinkIcon size={9} />{[branch.link1, branch.link2].filter(Boolean).join(' · ')}</span>}
                  </span>
                </span>
              </button>

              <div className="absolute right-2 top-2 flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(branch)} aria-label={`Edit ${branch.name}`} title="Edit branch"><Pencil size={12} /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-nord-11" onClick={() => onDelete(branch)} aria-label={`Delete ${branch.name}`} title="Delete branch"><Trash2 size={12} /></Button>
              </div>
            </motion.article>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
