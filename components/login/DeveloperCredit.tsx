'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { wait } from '@/lib/timing'

const PLACEHOLDER_CREDIT = 'Developed By ...'
const DEVELOPER_NAME = 'Ali Ajeli Lahiji'
export const FINAL_CREDIT = `Developed By ${DEVELOPER_NAME}`

/**
 * The typed developer credit under the welcome title. It types a placeholder,
 * deletes the last characters and retypes the real name, then calls
 * onComplete so the login card can shrink its intro and reveal the form.
 */
export default function DeveloperCredit({ onComplete, reduceMotion }: any) {
  // Always start empty so the server-rendered HTML and the first client
  // render match; reduced-motion short-circuits inside the effect instead.
  const [text, setText] = useState('')

  useEffect(() => {
    let active = true

    const typeText = async (value, speed, startAt = 1) => {
      for (let index = startAt; active && index <= value.length; index += 1) {
        setText(value.slice(0, index))
        await wait(speed)
      }
    }

    const playSequence = async () => {
      if (reduceMotion) {
        setText(FINAL_CREDIT)
        onComplete()
        return
      }

      await wait(1450)
      if (!active) return
      await typeText(PLACEHOLDER_CREDIT, 46)
      await wait(720)

      for (let index = 1; active && index <= 3; index += 1) {
        setText(PLACEHOLDER_CREDIT.slice(0, -index))
        await wait(125)
      }

      await typeText(FINAL_CREDIT, 48, PLACEHOLDER_CREDIT.length - 3 + 1)
      await wait(620)
      if (active) onComplete()
    }

    playSequence()
    return () => {
      active = false
    }
  }, [onComplete, reduceMotion])

  return (
    <motion.div
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: text ? 1 : 0, y: text ? 0 : 7 }}
      className="mt-3 flex h-6 items-center justify-center font-mono text-xs font-medium tracking-[0.04em] text-[rgb(var(--muted))]"
      aria-label={FINAL_CREDIT}
    >
      <span aria-hidden="true">
        <span className="text-[rgb(var(--primary))]">{'<'}</span>
        <span className="mx-1.5">{text}</span>
        <span className="text-[rgb(var(--primary))]">{'/>'}</span>
        <span className="login-code-caret ml-1 inline-block h-4 w-[2px] rounded-full bg-[rgb(var(--primary))] align-middle" />
      </span>
    </motion.div>
  )
}
