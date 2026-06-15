/** A small backgammon-board logo for the hub card and the game menu. */
export function BackgammonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Backgammon board">
      <rect x="3" y="6" width="58" height="52" rx="6" fill="#271746" stroke="#7c3aed" strokeWidth="2" />
      {/* central bar */}
      <rect x="30" y="8" width="4" height="48" fill="#140c2e" />
      {/* alternating triangles, top points down + bottom points up */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 6 + i * 4 + (i >= 3 ? 4 : 0)
        const fill = i % 2 === 0 ? '#ece3cf' : '#a855f7'
        return <polygon key={`t${i}`} points={`${x},9 ${x + 3.4},9 ${x + 1.7},30`} fill={fill} opacity={0.92} />
      })}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 36 + i * 4 + (i >= 3 ? 4 : 0)
        const fill = i % 2 === 0 ? '#a855f7' : '#ece3cf'
        return <polygon key={`tr${i}`} points={`${x},9 ${x + 3.4},9 ${x + 1.7},30`} fill={fill} opacity={0.92} />
      })}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 6 + i * 4 + (i >= 3 ? 4 : 0)
        const fill = i % 2 === 0 ? '#a855f7' : '#ece3cf'
        return <polygon key={`b${i}`} points={`${x},55 ${x + 3.4},55 ${x + 1.7},34`} fill={fill} opacity={0.92} />
      })}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 36 + i * 4 + (i >= 3 ? 4 : 0)
        const fill = i % 2 === 0 ? '#ece3cf' : '#a855f7'
        return <polygon key={`br${i}`} points={`${x},55 ${x + 3.4},55 ${x + 1.7},34`} fill={fill} opacity={0.92} />
      })}
      {/* a couple of checkers for flavour */}
      <circle cx="7.7" cy="51" r="2.6" fill="#ece3cf" stroke="#0008" strokeWidth="0.5" />
      <circle cx="56.3" cy="13" r="2.6" fill="#2c2535" stroke="#fff4" strokeWidth="0.5" />
    </svg>
  )
}
