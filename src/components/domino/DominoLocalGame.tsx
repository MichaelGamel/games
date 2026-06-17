import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useDomino } from '../../hooks/useDomino'
import { useDominoBotAutoPlay } from '../../hooks/useDominoBotAutoPlay'
import { useRecordMatch } from '../../hooks/useRecordMatch'
import { useUnloadGuard } from '../../hooks/useUnloadGuard'
import { WinnerOverlay } from '../WinnerOverlay'
import { DominoSetupScreen } from './DominoSetupScreen'
import { DominoGameScreen } from './DominoGameScreen'
import { DominoEndChoiceOverlay } from './DominoEndChoiceOverlay'
import { PassDeviceScreen } from './PassDeviceScreen'
import { dominoWinnerInfo } from './winnerInfo'
import type { DominoTableStyle } from './tableStyle'

/** Local "pass & play": all players share one screen and device, with an
 *  optional privacy hand-off between turns so hidden hands stay hidden. */
export function DominoLocalGame({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation(['domino', 'common'])
  const game = useDomino({ controlsPlayer: 'all' })
  const [privateHands, setPrivateHands] = useState(true)
  const [tableStyle, setTableStyle] = useState<DominoTableStyle>('classic')
  // Which seat has revealed its hand this turn (the privacy hand-off gate). It
  // re-arms whenever the turn passes to a new seat — tracked during render.
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null)
  const [seatShown, setSeatShown] = useState(game.currentPlayerIndex)
  if (seatShown !== game.currentPlayerIndex) {
    setSeatShown(game.currentPlayerIndex)
    setRevealedSeat(null)
  }

  useDominoBotAutoPlay(game)
  useUnloadGuard(game.phase !== 'setup' && game.phase !== 'won')
  useRecordMatch('domino', game.phase, game.players, game.winnerId)

  const current = game.currentPlayer
  const inPlay =
    game.phase === 'idle' || game.phase === 'choosing' || game.phase === 'placing' || game.phase === 'drawing'
  // The privacy hand-off only matters when two or more humans share the device;
  // with a single human (the rest bots) there's nobody to hide the hand from.
  const humanCount = game.players.reduce((n, p) => (p.isBot ? n : n + 1), 0)
  // A human must reveal before acting; bots never need the hand-off.
  const needsPass =
    inPlay &&
    privateHands &&
    humanCount >= 2 &&
    current != null &&
    !current.isBot &&
    revealedSeat !== game.currentPlayerIndex
  // The end-choice prompt only belongs to a human (bots auto-resolve theirs).
  const showChoice = game.choice != null && current != null && !current.isBot && !needsPass

  const start = (players: Parameters<typeof game.startGame>[0], isPrivate: boolean, style: DominoTableStyle) => {
    setPrivateHands(isPrivate)
    setTableStyle(style)
    setRevealedSeat(null)
    game.startGame(players)
  }

  const info = game.phase === 'won' ? dominoWinnerInfo(game) : null
  const subtitle = info?.isTie
    ? t('tieSubtitle')
    : info && info.winnerPips != null
      ? t('wonBlocked', { pips: info.winnerPips })
      : undefined

  return (
    <>
      <AnimatePresence mode="wait">
        {game.phase === 'setup' ? (
          <DominoSetupScreen key="setup" onStart={(players, priv, style) => start(players, priv, style)} onBack={onExit} />
        ) : (
          <DominoGameScreen
            key="game"
            game={game}
            viewerSeat={game.currentPlayerIndex}
            secondaryLabel={t('common:actions.newGame')}
            onSecondary={game.reset}
            tableStyle={tableStyle}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {needsPass && current && (
          <PassDeviceScreen
            key={`pass-${game.currentPlayerIndex}-${game.turnCount}`}
            name={current.name}
            color={current.color}
            onReady={() => setRevealedSeat(game.currentPlayerIndex)}
          />
        )}

        {showChoice && game.choice && (
          <DominoEndChoiceOverlay
            key="choice"
            ends={game.choice.ends}
            leftEnd={game.line.leftEnd}
            rightEnd={game.line.rightEnd}
            onChoose={(end) => void game.chooseEnd(end)}
          />
        )}

        {game.phase === 'won' && info && info.standings.length > 0 && (
          <WinnerOverlay
            key="winner"
            standings={info.standings}
            subtitle={subtitle}
            onPlayAgain={() =>
              start(
                game.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot, botLevel: p.botLevel })),
                privateHands,
                tableStyle,
              )
            }
            onSecondary={game.reset}
          />
        )}
      </AnimatePresence>
    </>
  )
}
