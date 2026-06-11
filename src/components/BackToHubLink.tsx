import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'

interface BackToHubLinkProps {
  /** Extra classes (e.g. positioning) merged onto the link. */
  className?: string
}

/**
 * A small "← Robin's Games" pill that returns to the hub. Shared by every game
 * shell so the back-affordance looks and behaves identically across games.
 */
export function BackToHubLink({ className }: BackToHubLinkProps) {
  return (
    <Link
      to="/"
      className={cn(
        'absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white/70 ring-1 ring-white/10 backdrop-blur transition',
        'hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        className,
      )}
    >
      <span aria-hidden="true">←</span> Robin&apos;s Games
    </Link>
  )
}
