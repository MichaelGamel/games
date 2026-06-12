import { cn } from '../../lib/cn'

/** What a game screen needs to know about the online room it is part of. */
export interface OnlineMeta {
  roomCode: string
  /** True when every player from the started lineup is still connected. */
  everyonePresent: boolean
  /** True while enough active players are connected to keep playing. */
  canPlay: boolean
  testMode: boolean
  onLeave: () => void
}

/** Connection dot + room code, shown under a game screen's title. */
export function RoomBadge({ meta }: { meta: OnlineMeta }) {
  return (
    <div className="mt-1.5 flex items-center justify-center gap-2 text-xs lg:mt-2">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
          meta.everyonePresent ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200',
        )}
      >
        <span
          className={cn('h-2 w-2 rounded-full', meta.everyonePresent ? 'bg-emerald-400' : 'bg-amber-400')}
          aria-hidden="true"
        />
        {meta.everyonePresent ? 'Connected' : 'Player away'}
      </span>
      <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono tracking-widest text-white/80">
        {meta.roomCode}
      </span>
      {meta.testMode && (
        <span className="rounded-full bg-white/10 px-2 py-1 text-white/45">test mode</span>
      )}
    </div>
  )
}
