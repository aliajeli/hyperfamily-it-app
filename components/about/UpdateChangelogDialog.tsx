'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ScrollText, X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui'

/** Changelog of the available update, over a blurred page (v2.0.16). */
export default function UpdateChangelogDialog({ open, setOpen, update }: any) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && update?.hasUpdate && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[70] bg-nord-0/55 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="dialog-content glass fixed left-1/2 top-1/2 z-[80] flex max-h-[80vh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-[rgb(var(--surface))] p-3.5 shadow-2xl outline-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-[rgb(var(--primary)/.14)] p-1.5 text-[rgb(var(--primary))]">
                    <ScrollText size={15} />
                  </div>
                  <div>
                    <DialogPrimitive.Title className="text-sm font-extrabold">
                      What's new in v{update.latestVersion}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-xs text-[rgb(var(--muted))]">
                      The release notes published with this update.
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Close changelog"
                      className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--border)/.5)] hover:text-[rgb(var(--text))]"
                    >
                      <X size={15} />
                    </button>
                  </DialogPrimitive.Close>
                </div>
                <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-[rgb(var(--canvas)/.6)] p-3 text-2xs leading-relaxed">
                  {update.releaseNotes}
                </div>
                <div className="mt-2.5 flex items-center justify-end border-t pt-2.5">
                  <DialogPrimitive.Close asChild>
                    <Button size="sm">Close</Button>
                  </DialogPrimitive.Close>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
