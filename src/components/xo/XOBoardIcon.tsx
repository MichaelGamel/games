import { XO_COLORS } from '../../xo/config'

/**
 * A miniature noughts-and-crosses board, used as the game's logo on the hub
 * card and the menu header: the classic `#` grid with a few ✕ and ◯ marks in
 * the game's own colors, so the logo and the board it links to never drift.
 */
const [ROSE, SKY] = XO_COLORS.map((c) => c.value)

interface XOBoardIconProps {
  className?: string
  title?: string
}

export function XOBoardIcon({ className, title }: XOBoardIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title ?? 'Tic-Tac-Toe board'}
      fill="none"
    >
      {/* the # grid */}
      <g stroke="rgba(255,255,255,0.85)" strokeWidth="4" strokeLinecap="round">
        <line x1="36" y1="8" x2="36" y2="92" />
        <line x1="64" y1="8" x2="64" y2="92" />
        <line x1="8" y1="36" x2="92" y2="36" />
        <line x1="8" y1="64" x2="92" y2="64" />
      </g>

      {/* ✕ top-left, ◯ centre, ✕ bottom-right — a winning rose diagonal */}
      <g strokeWidth="7" strokeLinecap="round">
        <g stroke={ROSE}>
          <line x1="14" y1="14" x2="30" y2="30" />
          <line x1="30" y1="14" x2="14" y2="30" />
          <line x1="70" y1="70" x2="86" y2="86" />
          <line x1="86" y1="70" x2="70" y2="86" />
        </g>
        <circle cx="50" cy="50" r="9" stroke={SKY} />
      </g>
    </svg>
  )
}
