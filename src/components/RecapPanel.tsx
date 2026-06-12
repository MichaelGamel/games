/**
 * The compact per-player stats table shown inside the winner overlay.
 * Game-agnostic shell: each game supplies its own rows via the summarizers
 * (`game/recap.ts`, `ludo/recap.ts`).
 */
export interface RecapRow {
  name: string
  color: string
  /** Short stat chips, e.g. "🐍 ×3" — keep to the interesting ones. */
  chips: string[]
}

export function RecapPanel({ title, rows }: { title: string; rows: RecapRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="mt-5 rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/45">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/40"
              style={{ background: row.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-white">{row.name}</span>
            <span className="shrink-0 text-white/65">{row.chips.join('  ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
