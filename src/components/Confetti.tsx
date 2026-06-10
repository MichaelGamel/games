import { useMemo } from 'react'
import { motion } from 'motion/react'

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#fde047']

/** A looping shower of confetti pieces. Pure decoration (aria-hidden). */
export function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.6 + Math.random() * 2,
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 720,
        drift: (Math.random() - 0.5) * 60,
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.5,
      })),
    [count],
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? '9999px' : '2px',
          }}
          initial={{ y: '-12vh', opacity: 0, rotate: 0 }}
          animate={{ y: '112vh', x: p.drift, rotate: p.rotate, opacity: [0, 1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  )
}
