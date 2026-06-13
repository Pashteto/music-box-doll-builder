'use client'

interface ProgressDotsProps {
  total: number
  current: number
  onJump?: (index: number) => void
}

/** Segmented progress indicator across the active slot sequence (E6-T1). */
export function ProgressDots({ total, current, onJump }: ProgressDotsProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to step ${i + 1}`}
          onClick={() => onJump?.(i)}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? 'w-6 bg-brand-primary shadow-[0_0_0_4px_rgba(161,29,44,0.16)]'
              : i < current
                ? 'w-1.5 bg-clay'
                : 'w-1.5 bg-surface-overlay'
          }`}
        />
      ))}
    </div>
  )
}
