import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useBankElHazz } from '../../hooks/useBankElHazz'
import { useBankBotAutoPlay } from '../../hooks/useBankBotAutoPlay'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { clearBankGame, loadBankGame, saveBankGame, type SavedBankGame } from '../../bank/save'
import { buildBankHistoryEntry, recordBankMatch } from '../../bank/history'
import { WinnerOverlay } from '../WinnerOverlay'
import { RecapPanel } from '../RecapPanel'
import { bankRecapRows } from '../recapRows'
import { BankSetupScreen } from './BankSetupScreen'
import { BankGameScreen } from './BankGameScreen'

/**
 * Local "pass & play": 2–4 players (humans or computers) share one screen and
 * device, taking turns rolling, buying, and bankrupting each other until one
 * tycoon is left standing. The in-progress match is persisted after every turn
 * so it can be resumed (Phase 8); each finished match is logged to history.
 */
export function BankLocalGame({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['bank', 'common'])
  const game = useBankElHazz({ controlsPlayer: 'all' })
  // Computer players act on their own turns (local pass-and-play only).
  useBankBotAutoPlay(game)

  // A resumable match found in storage (offered once, before a new game starts).
  const [saved, setSaved] = useState<SavedBankGame | null>(() => loadBankGame())

  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  useRecordMatch('bank', game.phase, game.players, game.winnerId)

  // Keep the freshest controller in a ref so the persistence effect can save the
  // latest committed state without re-running on every animation re-render.
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })

  // Persist the in-progress match after every settled turn so closing the tab
  // never loses progress. `turnCount` advances once per committed event; `phase`
  // also covers the buy pause (`deciding`).
  useEffect(() => {
    const g = gameRef.current
    if (g.phase === 'idle' || g.phase === 'deciding') saveBankGame(g, g.matchLog, Date.now())
  }, [game.turnCount, game.phase])

  // On a finished match: drop the save and log it to history exactly once.
  const recordedRef = useRef(false)
  useEffect(() => {
    if (game.phase !== 'won') {
      recordedRef.current = false
      return
    }
    if (recordedRef.current) return
    recordedRef.current = true
    clearBankGame()
    setSaved(null)
    if (game.matchLog) recordBankMatch(buildBankHistoryEntry(game.matchLog, game.winnerId, Date.now()))
  }, [game.phase, game.matchLog, game.winnerId])

  const startFresh = (...args: Parameters<typeof game.startGame>) => {
    clearBankGame()
    setSaved(null)
    game.startGame(...args)
  }

  // "New Game" abandons the current match: drop the save so it isn't re-offered.
  const handleReset = () => {
    clearBankGame()
    setSaved(null)
    game.reset()
  }

  const offerResume = saved != null && game.phase === 'setup'

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <BankSetupScreen key="setup" onStart={(players, rules) => startFresh(players, rules)} onBack={onExit} />
        ) : (
          <BankGameScreen key="game" game={game} onNewGame={handleReset} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {offerResume && saved && (
          <ResumePrompt
            key="resume"
            savedAt={saved.savedAt}
            playerCount={saved.state.players.length}
            onResume={() => game.resume(saved)}
            onDiscard={() => {
              clearBankGame()
              setSaved(null)
            }}
          />
        )}

        {game.phase === 'won' && game.winner && (
          <WinnerOverlay
            key="winner"
            standings={game.standings}
            recap={
              game.matchLog ? (
                <RecapPanel title={t('common:overlay.matchRecap')} rows={bankRecapRows(game.matchLog)} />
              ) : undefined
            }
            onPlayAgain={() =>
              startFresh(
                game.players.map((p) => ({
                  name: p.name,
                  color: p.color,
                  isBot: p.isBot,
                  botLevel: p.botLevel,
                })),
                game.rules,
              )
            }
            onSecondary={game.reset}
            secondaryLabel={t('common:overlay.newPlayers')}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/** A one-time prompt to resume the saved match (or discard it and set up fresh). */
function ResumePrompt({
  savedAt,
  playerCount,
  onResume,
  onDiscard,
}: {
  savedAt: number
  playerCount: number
  onResume: () => void
  onDiscard: () => void
}) {
  const { t, i18n } = useTranslation('bank')
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(savedAt),
  )
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('resume.title')}
    >
      <m.div
        className="w-full max-w-sm rounded-3xl bg-night-800/95 p-6 text-center shadow-2xl ring-1 ring-white/15"
        initial={{ scale: 0.85, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <div className="text-4xl" aria-hidden="true">
          🏦
        </div>
        <h2 className="mt-2 text-xl font-bold text-white">{t('resume.title')}</h2>
        <p className="mt-1 text-sm text-white/65">{t('resume.body', { count: playerCount, when })}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="rounded-xl bg-linear-to-r from-amber-500 to-emerald-500 px-6 py-3 text-base font-bold text-white shadow-lg ring-1 ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t('resume.continue')}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {t('resume.fresh')}
          </button>
        </div>
      </m.div>
    </m.div>
  )
}
