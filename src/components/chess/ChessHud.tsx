/**
 * The floating glass HUD over the 3D board: a turn banner, the control cluster
 * (flip / undo / new game / mute), the captured-piece trays with a material
 * advantage chip, and the move list. The root is `pointer-events-none` so taps
 * fall through to the canvas everywhere except on the controls themselves.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { ChessController } from '../../hooks/useChessGame'
import { ChessPieceGlyph } from './ChessPieceGlyph'

export function ChessHud({ c }: { c: ChessController }) {
  const { t } = useTranslation(['chess', 'common'])

  const turnLabel = c.thinking
    ? t('chess:turn.thinking')
    : c.mode === 'solo'
      ? c.turn === 'w'
        ? t('chess:turn.your')
        : t('chess:turn.thinking')
      : c.turn === 'w'
        ? t('chess:turn.white')
        : t('chess:turn.black')

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Turn banner — hidden once the game is over (the overlay takes over). */}
      {!c.outcome && (
        <m.div
          key={turnLabel}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white/8 px-5 py-2 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur"
        >
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              c.turn === 'w' ? 'bg-amber-100' : 'bg-violet-400',
              c.thinking && 'animate-pulse',
            )}
          />
          {turnLabel}
          {c.inCheck && (
            <span className="ms-1 rounded-full bg-rose-500/25 px-2 py-0.5 text-xs font-bold text-rose-200 animate-pulse">
              {t('chess:hud.check')}
            </span>
          )}
        </m.div>
      )}

      {/* Control cluster, top-right, below the language switcher. */}
      <div className="pointer-events-auto absolute end-4 top-16 flex flex-col items-end gap-2">
        <IconButton label={t('chess:controls.flip')} onClick={c.flip} ariaLabel={t('chess:controls.flipAria')}>
          ⟲
        </IconButton>
        <IconButton
          label={t('chess:controls.spin')}
          onClick={c.toggleAutoRotate}
          ariaLabel={t('chess:controls.spinAria')}
          active={c.autoRotate}
        >
          🌀
        </IconButton>
        <IconButton
          label={t('common:actions.undo')}
          onClick={c.undo}
          ariaLabel={t('chess:controls.undoAria')}
          disabled={!c.canUndo}
        >
          ↶
        </IconButton>
        <IconButton
          label={t('common:actions.newGame')}
          onClick={c.newGame}
          ariaLabel={t('chess:controls.newGameAria')}
        >
          ♻
        </IconButton>
        <IconButton
          label={c.muted ? t('common:actions.muted') : t('common:actions.sound')}
          onClick={c.toggleMute}
          ariaLabel={c.muted ? t('common:actions.unmuteAria') : t('common:actions.muteAria')}
        >
          {c.muted ? '🔇' : '🔊'}
        </IconButton>
      </div>

      {/* Captured trays + advantage, bottom-centre. */}
      <CapturedTray c={c} />

      {/* Move list — only where there's room. */}
      <MoveList history={c.history} title={t('chess:hud.moves')} empty={t('chess:hud.noMoves')} />
    </div>
  )
}

function IconButton({
  children,
  label,
  ariaLabel,
  onClick,
  disabled,
  active,
}: {
  children: ReactNode
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  /** Renders a highlighted "on" state (for toggles like auto-spin). */
  active?: boolean
}) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      whileHover={disabled ? undefined : { scale: 1.05, x: -2 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={cn(
        'flex w-28 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-white ring-1 backdrop-blur transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        active ? 'bg-grape/70 ring-grape-light' : 'bg-white/8 ring-white/15',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/15',
      )}
    >
      <span className="text-base leading-none" aria-hidden="true">
        {children}
      </span>
      {label}
    </m.button>
  )
}

function CapturedTray({ c }: { c: ChessController }) {
  const advPawns = Math.round(Math.abs(c.advantage) / 100)
  if (c.captured.w.length === 0 && c.captured.b.length === 0) return null

  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-white/8 px-4 py-2 ring-1 ring-white/12 backdrop-blur">
      <div className="flex min-w-0 items-center gap-0.5 text-xl">
        {c.captured.w.map((p, i) => (
          <ChessPieceGlyph key={i} type={p} tone="dark" />
        ))}
      </div>
      {advPawns > 0 && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
            c.advantage > 0 ? 'bg-amber-300/20 text-amber-200' : 'bg-violet-400/20 text-violet-200',
          )}
        >
          +{advPawns}
        </span>
      )}
      <div className="flex min-w-0 items-center gap-0.5 text-xl">
        {c.captured.b.map((p, i) => (
          <ChessPieceGlyph key={i} type={p} tone="light" />
        ))}
      </div>
    </div>
  )
}

function MoveList({ history, title, empty }: { history: string[]; title: string; empty: string }) {
  const scrollRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history])

  const rows: Array<[number, string, string | undefined]> = []
  for (let i = 0; i < history.length; i += 2) {
    rows.push([i / 2 + 1, history[i], history[i + 1]])
  }

  return (
    <div className="absolute end-4 top-1/2 hidden w-44 -translate-y-1/2 rounded-2xl bg-white/8 p-3 ring-1 ring-white/12 backdrop-blur lg:block">
      <h2 className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-violet-200">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="px-1 py-2 text-center text-xs text-white/50">{empty}</p>
      ) : (
        <ol ref={scrollRef} className="max-h-64 space-y-0.5 overflow-y-auto text-sm tabular-nums">
          {rows.map(([n, white, black]) => (
            <li key={n} className="flex items-center gap-2 rounded-lg px-2 py-0.5 odd:bg-white/5">
              <span className="w-5 shrink-0 text-end text-xs text-white/40">{n}.</span>
              <span className="flex-1 font-medium text-amber-50">{white}</span>
              <span className="flex-1 font-medium text-violet-200">{black ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
