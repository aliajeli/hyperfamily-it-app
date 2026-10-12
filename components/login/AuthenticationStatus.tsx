'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleX, ShieldCheck } from 'lucide-react'

/** The checking / success / entering / error state shown instead of the form. */
export default function AuthenticationStatus({ phase }: any) {
  const success = phase === 'success' || phase === 'entering'
  const failed = phase === 'error'

  return (
    <motion.div
      key="authentication-status"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-[264px] flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === 'checking' && (
            <motion.div key="checking" className="absolute inset-0">
              <motion.div
                className="absolute inset-0 rounded-full border border-[rgb(var(--primary)/.18)]"
                animate={{ scale: [0.82, 1.18], opacity: [0.8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
              />
              <motion.div
                className="absolute inset-2 rounded-full border-2 border-transparent border-r-[rgb(var(--secondary))] border-t-[rgb(var(--primary))]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.05, repeat: Infinity, ease: 'linear' }}
              />
              <motion.div
                className="absolute inset-5 flex items-center justify-center rounded-full bg-[rgb(var(--primary)/.1)] text-[rgb(var(--primary))]"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <ShieldCheck size={30} strokeWidth={1.8} />
              </motion.div>
            </motion.div>
          )}

          {success && (
            <motion.div
              key="success"
              initial={{ scale: 0.45, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 17 }}
              className="absolute inset-2 flex items-center justify-center rounded-full bg-nord-14 text-white shadow-[0_0_32px_rgba(163,190,140,.42)]"
            >
              <motion.div
                initial={{ rotate: -35, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.18, type: 'spring' }}
              >
                <Check size={42} strokeWidth={2.8} />
              </motion.div>
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-nord-14"
                animate={{ scale: [1, 1.42], opacity: [0.7, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
              />
            </motion.div>
          )}

          {failed && (
            <motion.div
              key="failed"
              initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              className="absolute inset-2 flex items-center justify-center rounded-full bg-nord-11/15 text-nord-11"
            >
              <CircleX size={42} strokeWidth={2.2} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="min-h-[68px]"
        >
          <h2 className="text-lg font-bold tracking-tight">
            {phase === 'checking' && 'Verifying credentials'}
            {phase === 'success' && 'Access granted'}
            {phase === 'entering' && 'Opening your workspace'}
            {phase === 'error' && 'Access denied'}
          </h2>
          <p className="mt-1.5 text-xs text-[rgb(var(--muted))]">
            {phase === 'checking' && 'Checking your encrypted local account…'}
            {phase === 'success' && 'Identity confirmed. Welcome back.'}
            {phase === 'entering' && 'Preparing the operations dashboard…'}
            {phase === 'error' && 'The username or password is incorrect.'}
          </p>
        </motion.div>
      </AnimatePresence>

      {phase === 'checking' && (
        <div className="mt-2 flex w-36 gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <motion.span
              key={item}
              className="h-1 flex-1 rounded-full bg-[rgb(var(--primary))]"
              animate={{ opacity: [0.18, 1, 0.18], scaleX: [0.72, 1, 0.72] }}
              transition={{ duration: 1, repeat: Infinity, delay: item * 0.14 }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
