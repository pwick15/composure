import type { Transition } from 'motion/react'

/** Default spring: quick to settle, a hint of overshoot. */
export const SPRING: Transition = { type: 'spring', stiffness: 720, damping: 44, mass: 0.7 }

export const SNAP: Transition = { type: 'spring', stiffness: 900, damping: 50, mass: 0.5 }

export const EXIT_FAST: Transition = { duration: 0.12, ease: [0.4, 0, 1, 1] }

/** Keeps buttons from stealing focus on click, so Enter and Space keep driving the app. */
export const keepFocus = (e: { preventDefault(): void }) => e.preventDefault()
