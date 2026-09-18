'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Check, Pencil, Trash2, Warehouse } from 'lucide-react'
import { Button, Select } from '@/components/ui'

export default function BranchList({
  branches,
  selectedBranchId,
  deviceCounts = {},
  onSelect,
  onEdit,
  onDelete
}: any) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!branches.length) {
    return (
      <div className="flex min-w-0 flex-1 items-center rounded-xl border border-dashed px-3 py-2 text-xs text-[rgb(var(--muted))]">
        A branch must be created before equipment can be added. Use the labeled Add branch button above.
      </div>
    )
  }

  if (isMobile) {
    const selected = branches.find((b: any) => b.id === selectedBranchId)
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Select
          value={String(selectedBranchId || '')}
          onChange={(e: any) => {
            const b = branches.find((x: any) => String(x.id) === e.target.value)
            if (b) onSelect(b)
          }}
          className="w-full rounded-xl border bg-[rgb(var(--surface))] px-3 py-2.5 text-sm font-bold"
        >
          {branches.map((branch: any) => (
            <option key={branch.id} value={branch.id}>
              {branch.name} — {branch.code} ({deviceCounts[branch.id] || 0} devices)
            </option>
          ))}
        </Select>
        {selected && (
          <div className="flex items-center justify-between rounded-xl border bg-[rgb(var(--primary)/.08)] px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[rgb(var(--primary))] text-white shrink-0"><Building2 size={13} /></span>
              <div className="min-w-0">
                <b className="block truncate text-xs">{selected.name}</b>
                <span className="flex items-center gap-1 text-2xs text-[rgb(var(--muted))]">
                  <span className="font-mono font-bold">{selected.code}</span>
                  {selected.warehouse_code && <><span>·</span><span className="flex items-center gap-0.5"><Warehouse size={8} />{selected.warehouse_code}</span></>}
                  <span>· {deviceCounts[selected.id] || 0} devices</span>
                </span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(selected)}><Pencil size={13} /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-nord-11" onClick={() => onDelete(selected)}><Trash2 size={13} /></Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
      <AnimatePresence initial={false}>
        {branches.map((branch: any, index: number) => {
          const selected = branch.id === selectedBranchId
          return (
            <motion.article
              layout
              key={branch.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ delay: Math.min(index * 0.018, 0.14) }}
              className={`directory-branch-card group relative h-11 w-[205px] shrink-0 overflow-hidden rounded-xl border transition-all ${selected ? 'border-[rgb(var(--primary)/.48)] bg-[rgb(var(--primary)/.09)] shadow-sm' : 'bg-[rgb(var(--surface)/.62)] hover:border-[rgb(var(--primary)/.25)] hover:bg-[rgb(var(--surface))]'}`}
            >
              <button
                type="button"
                onClick={() => onSelect(branch)}
                className="flex h-full w-full items-center gap-1.5 px-2 pr-[54px] text-left"
                aria-pressed={selected}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors ${selected ? 'bg-[rgb(var(--primary))] text-white' : 'bg-[rgb(var(--border)/.55)] text-[rgb(var(--muted))]'}`}
                >
                  {selected ? <Check size={12} /> : <Building2 size={12} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black tracking-[0.035em]">{branch.name}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs font-semibold text-[rgb(var(--muted))]">
                    <span className="font-mono font-bold">{branch.code}</span>
                    {branch.warehouse_code && (
                      <>
                        <span>·</span>
                        <span className="flex min-w-0 items-center gap-0.5 truncate">
                          <Warehouse size={7} />
                          {branch.warehouse_code}
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span>{deviceCounts[branch.id] || 0}</span>
                  </span>
                </span>
              </button>

              <div className="absolute right-1 top-2 flex gap-0 opacity-65 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onEdit(branch)}
                  aria-label={`Edit ${branch.name}`}
                  title="Edit branch"
                >
                  <Pencil size={10} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-nord-11"
                  onClick={() => onDelete(branch)}
                  aria-label={`Delete ${branch.name}`}
                  title="Delete branch"
                >
                  <Trash2 size={10} />
                </Button>
              </div>
            </motion.article>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
