'use client'

import { useEffect } from 'react'

/**
 * Safety net against a permanently unresponsive interface.
 *
 * Radix's modal primitives (Dialog, DropdownMenu, Select) set
 * `pointer-events: none` on <body> while a modal layer is open and remove it on
 * cleanup. If a layer unmounts in the same tick that it closes — which is what
 * happens when a row is deleted and the list re-renders underneath the menu
 * that triggered the delete — the cleanup can be skipped, and the style is left
 * behind forever. The window then looks completely normal but ignores every
 * click and keystroke, so no text box can be focused or typed into.
 *
 * This guard watches <body> and strips the lock whenever no Radix layer is
 * actually mounted, so the fault can never persist even if a future component
 * reintroduces the same race. It is a few microseconds of work per mutation and
 * is inert while a real modal is open.
 */

/** Elements Radix mounts while a modal layer is genuinely open. */
const LAYER_SELECTOR = [
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-radix-focus-guard]'
].join(',')

function releaseIfStuck() {
  const { body } = document
  if (!body) return
  const locked = body.style.pointerEvents === 'none'
  if (!locked) return
  if (document.querySelector(LAYER_SELECTOR)) return
  body.style.removeProperty('pointer-events')
  // react-remove-scroll can also leave the scroll lock behind with it.
  if (!document.querySelector(LAYER_SELECTOR)) {
    body.style.removeProperty('overflow')
    body.removeAttribute('data-scroll-locked')
  }
}

export default function InteractionGuard() {
  useEffect(() => {
    releaseIfStuck()

    // Defer briefly so Radix's own cleanup wins the tick when it does run;
    // a timer is used rather than an animation frame because frames are
    // throttled (or never delivered) in background and headless windows,
    // which would leave the interface locked exactly when it matters.
    let pending = null
    const scheduleCheck = () => {
      if (pending) return
      pending = setTimeout(() => { pending = null; releaseIfStuck() }, 50)
    }

    // One registration only: calling observe() twice on the same node replaces
    // the earlier options rather than adding to them, which would silently
    // stop the attribute watch this guard depends on.
    const observer = new MutationObserver(scheduleCheck)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'data-scroll-locked'],
      childList: true
    })

    // A click that lands on nothing is the classic symptom; re-check then too.
    const onPointerDown = () => scheduleCheck()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('focusin', onPointerDown, true)

    // Final backstop: even if every event above is missed, the interface can
    // never stay dead for more than a second.
    const sweep = setInterval(releaseIfStuck, 1000)

    return () => {
      clearTimeout(pending)
      clearInterval(sweep)
      observer.disconnect()
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('focusin', onPointerDown, true)
    }
  }, [])

  return null
}
