'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Check, Pencil, Plus, Trash2, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui'

export default function BranchList({ branches, selectedBranchId, deviceCounts = {}, onSelect, onEdit, onDelete, onAdd }) {
  if (!branches.length) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2 text-[10px] text-[rgb(var(--muted))]">
        <span>A branch must be created before equipment can be added.</span>
        <Button size="sm" onClick={onAdd}><Plus size={13} />Add first branch</Button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
      <AnimatePresence initial={false}>
        {branches.map((branch, index) => {
          const selected = branch.id === selectedBranchId
          return (
            <motion.article
              layout
              key={branch.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ delay: index * 0.018 }}
              className={`directory-branch-card group relative h-12 w-[245px] shrink-0 overflow-hidden rounded-xl border transition-all ${selected ? 'border-[rgb(var(--primary)/.48)] bg-[rgb(var(--primary)/.09)] shadow-sm' : 'bg-[rgb(var(--surface)/.62)] hover:border-[rgb(var(--primary)/.25)] hover:bg-[rgb(var(--surface))]'}`}
            >
              <button type="button" onClick={() => onSelect(branch)} className="flex h-full w-full items-center gap-2 px-2.5 pr-16 text-left" aria-pressed={selected}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${selected ? 'bg-[rgb(var(--primary))] text-white' : 'bg-[rgb(var(--border)/.55)] text-[rgb(var(--muted))]'}`}>
                  {selected ? <Check size={13} /> : <Building2 size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-black tracking-[0.02em]">{branch.name}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[7px] font-semibold text-[rgb(var(--muted))]">
                    <span className="font-mono font-bold">{branch.code}</span>
                    {branch.warehouse_code && <><span>·</span><span className="flex min-w-0 items-center gap-0.5 truncate"><Warehouse size={7} />{branch.warehouse_code}</span></>}
                    <span>·</span><span>{deviceCounts[branch.id] || 0} devices</span>
                  </span>
                </span>
              </button>

              <div className="absolute right-1.5 top-2 flex gap-0.5 opacity-65 transition-opacity group-hover:opacity-100">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(branch)} aria-label={`Edit ${branch.name}`} title="Edit branch"><Pencil size={11} /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-nord-11" onClick={() => onDelete(branch)} aria-label={`Delete ${branch.name}`} title="Delete branch"><Trash2 size={11} /></Button>
              </div>
            </motion.article>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
