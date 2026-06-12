import { memo } from 'react'
import { CARD_COLOR_HEX } from '../../../uno/config'
import type { UnoCard as UnoCardType, UnoValue } from '../../../uno/types'
import { cn } from '../../../lib/cn'

/** The glyph shown for a card's value (numbers render as their digit). */
function cardGlyph(value: UnoValue): string {
  if (typeof value === 'number') return String(value)
  switch (value) {
    case 'skip':
      return '⊘'
    case 'reverse':
      return '⇆'
    case 'draw2':
      return '+2'
    case 'wild':
      return '✦'
    case 'wild4':
      return '+4'
  }
}

/** A four-suit conic wheel, used as the field of wild cards. */
const WILD_WHEEL =
  'conic-gradient(from 90deg, #ef4444 0deg 90deg, #eab308 90deg 180deg, #22c55e 180deg 270deg, #3b82f6 270deg 360deg)'

interface UnoCardProps {
  /** The card to show; ignored when `faceDown`. */
  card?: UnoCardType | null
  /** Render the patterned back instead of the face. */
  faceDown?: boolean
  /** Card width in px (height is 1.4×). */
  width?: number
  className?: string
}

/**
 * One UNO card, fully synthesized in CSS/SVG (no asset files). A colored field
 * with the classic skewed white oval, a large centred glyph, and mirrored corner
 * indices; wild cards use a four-suit wheel. The back shows the "UNO" oval.
 */
export const UnoCard = memo(function UnoCard({ card, faceDown, width = 64, className }: UnoCardProps) {
  const height = Math.round(width * 1.4)
  const radius = Math.round(width * 0.14)
  const style = { width, height, borderRadius: radius } as const

  if (faceDown || !card) {
    return (
      <div
        className={cn('relative shrink-0 select-none ring-1 ring-black/30 shadow-md', className)}
        style={{ ...style, background: 'linear-gradient(135deg, #1f2540, #0b0f1f)' }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ transform: 'rotate(-22deg)' }}
        >
          <span
            className="grid place-items-center rounded-[50%] font-black italic text-white"
            style={{
              width: width * 0.74,
              height: width * 0.5,
              fontSize: width * 0.26,
              background: 'linear-gradient(135deg,#ef4444,#b91c1c)',
              boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
            }}
          >
            UNO
          </span>
        </div>
      </div>
    )
  }

  const isWild = card.color == null
  const field = isWild ? '#15192c' : CARD_COLOR_HEX[card.color!]
  const glyph = cardGlyph(card.value)

  return (
    <div
      className={cn('relative shrink-0 select-none ring-1 ring-black/20 shadow-md', className)}
      style={{ ...style, background: field }}
      role="img"
      aria-label={isWild ? String(card.value) : `${card.color} ${card.value}`}
    >
      {/* Skewed white oval centerpiece */}
      <div className="absolute inset-0 grid place-items-center overflow-hidden" style={{ borderRadius: radius }}>
        <div
          className="grid place-items-center"
          style={{
            width: width * 0.96,
            height: width * 0.64,
            borderRadius: '50%',
            transform: 'rotate(-32deg)',
            background: isWild ? WILD_WHEEL : 'white',
          }}
        />
      </div>

      {/* Centre glyph */}
      <span
        className="absolute inset-0 grid place-items-center font-black"
        style={{
          fontSize: width * (glyph.length > 1 ? 0.42 : 0.56),
          color: isWild ? 'white' : field,
          textShadow: isWild ? '0 1px 3px rgba(0,0,0,0.6)' : '0 1px 0 rgba(0,0,0,0.08)',
          WebkitTextStroke: isWild ? '1px rgba(0,0,0,0.25)' : undefined,
        }}
      >
        {glyph}
      </span>

      {/* Mirrored corner indices */}
      <CornerIndex glyph={glyph} width={width} corner="tl" wild={isWild} />
      <CornerIndex glyph={glyph} width={width} corner="br" wild={isWild} />
    </div>
  )
})

function CornerIndex({
  glyph,
  width,
  corner,
  wild,
}: {
  glyph: string
  width: number
  corner: 'tl' | 'br'
  wild: boolean
}) {
  const pos =
    corner === 'tl'
      ? { top: width * 0.06, left: width * 0.08 }
      : { bottom: width * 0.06, right: width * 0.08, transform: 'rotate(180deg)' }
  return (
    <span
      className="absolute font-black leading-none text-white"
      style={{
        ...pos,
        fontSize: width * (glyph.length > 1 ? 0.2 : 0.26),
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        opacity: wild ? 0.95 : 1,
      }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  )
}
