/**
 * The chess hub logo — a sculpted knight in profile, the game's most
 * recognisable silhouette, filled with the night/grape gradient so it sits in
 * the same family as the Ludo and Tic-Tac-Toe marks. Used on the hub card and
 * each menu header.
 */
interface ChessIconProps {
  className?: string
  title?: string
}

export function ChessIcon({ className, title }: ChessIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title ?? 'Chess knight'}
    >
      <defs>
        <linearGradient id="chess-knight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* base */}
      <rect x="20" y="86" width="54" height="9" rx="4" fill="url(#chess-knight)" />
      <rect x="26" y="80" width="42" height="8" rx="3" fill="url(#chess-knight)" opacity="0.85" />
      {/* knight head profile */}
      <path
        d="M53 86 L24 86 L21 72 L24 56 L28 42 L34 31 L32 24 L40 21 L44 29 L50 21 L55 27 L62 38 L70 47 L81 55 L88 61 L89 66 L82 69 L86 74 L74 72 L67 65 L61 68 L58 76 L54 83 Z"
        fill="url(#chess-knight)"
        stroke="#ede9fe"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* eye */}
      <circle cx="66" cy="44" r="2.6" fill="#1a1033" />
    </svg>
  )
}
