/**
 * A synthesized domino bone, used as the hub card + menu logo (no asset files).
 * A tilted 6-3 tile with drawn pips.
 */
export function DominoIcon({ className }: { className?: string }) {
  // Pip coordinates within a 0..30 half-cell, mapped per face value.
  const dots: Record<number, Array<[number, number]>> = {
    3: [
      [8, 8],
      [15, 15],
      [22, 22],
    ],
    6: [
      [8, 7],
      [8, 15],
      [8, 23],
      [22, 7],
      [22, 15],
      [22, 23],
    ],
  }
  return (
    <svg viewBox="0 0 60 60" className={className} role="img" aria-label="Dominoes">
      <g transform="rotate(-18 30 30)">
        <rect x="8" y="14" width="44" height="32" rx="6" fill="#f7f3e8" stroke="#0b0f1f" strokeWidth="1.5" />
        <line x1="30" y1="16" x2="30" y2="44" stroke="#0b0f1f" strokeOpacity="0.35" strokeWidth="1.5" />
        <g transform="translate(8,15)" fill="#0b0f1f">
          {dots[6].map(([x, y], i) => (
            <circle key={i} cx={x * 0.7 + 1} cy={y * 1.0} r="2.2" />
          ))}
        </g>
        <g transform="translate(30,15)" fill="#0b0f1f">
          {dots[3].map(([x, y], i) => (
            <circle key={i} cx={x * 0.7 + 1} cy={y * 1.0} r="2.2" />
          ))}
        </g>
      </g>
    </svg>
  )
}
