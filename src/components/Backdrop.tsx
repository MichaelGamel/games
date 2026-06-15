import type { ReactNode } from 'react'

interface BackdropProps {
  children: ReactNode
}

/**
 * The shared "Robin's Games" chrome: a full-screen night canvas with a slowly
 * panning gradient and soft floating blobs. Every route (the hub and each game)
 * renders inside it, so the brand backdrop is byte-identical everywhere and
 * lives in exactly one place.
 */
export function Backdrop({ children }: BackdropProps) {
  return (
    <div
      className="relative min-h-screen overflow-hidden bg-night-900 text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]"
    >
      {/* slowly panning gradient backdrop */}
      <div className="animate-gradient pointer-events-none absolute inset-0 bg-linear-to-br from-night-900 via-night-800 to-night-700 bg-[length:200%_200%]" />
      {/* soft floating blobs for depth */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -left-24 top-12 h-72 w-72 rounded-full bg-grape/25 blur-3xl" />
        <div className="animate-float-slow absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-grape-light/20 blur-3xl" />
      </div>
      {children}
    </div>
  )
}
