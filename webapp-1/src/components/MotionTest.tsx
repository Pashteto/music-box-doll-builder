'use client'

import { motion } from 'motion/react'

// E0-T4 smoke test: confirms Framer Motion (the `motion` package) renders under
// React 19 + Next 15 App Router without hydration warnings.
export function MotionTest() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="rounded-md bg-brand-secondary/10 px-3 py-1 text-sm text-brand-secondary"
    >
      Framer Motion is wired up ✓
    </motion.div>
  )
}
