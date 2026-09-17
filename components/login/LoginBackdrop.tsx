'use client'

import { motion } from 'framer-motion'

/** The floating aurora blobs and particles behind the login card. */
export default function LoginBackdrop() {
  return (
    <>
      <div className="pointer-events-none fixed -left-32 -top-36 h-[30rem] w-[30rem] animate-float rounded-full bg-nord-8/25 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-44 -right-28 h-[34rem] w-[34rem] animate-float rounded-full bg-nord-15/20 blur-3xl [animation-delay:-9s]" />
      <motion.div
        className="pointer-events-none fixed left-[12%] top-[18%] h-2 w-2 rounded-full bg-[rgb(var(--primary)/.36)]"
        animate={{ y: [0, -20, 0], opacity: [0.25, 0.8, 0.25] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none fixed bottom-[22%] right-[15%] h-1.5 w-1.5 rounded-full bg-[rgb(var(--secondary)/.48)]"
        animate={{ y: [0, 18, 0], opacity: [0.2, 0.75, 0.2] }}
        transition={{ duration: 3.8, repeat: Infinity, delay: 0.7, ease: 'easeInOut' }}
      />
    </>
  )
}
