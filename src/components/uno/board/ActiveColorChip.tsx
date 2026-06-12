import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { CARD_COLOR_HEX } from '../../../uno/config'
import type { UnoColor } from '../../../uno/types'

interface ActiveColorChipProps {
  color: UnoColor
  size?: number
}

/** The chip showing the color currently in play; morphs after a wild pick. */
export function ActiveColorChip({ color, size = 40 }: ActiveColorChipProps) {
  const { t } = useTranslation('uno')
  return (
    <div className="flex flex-col items-center gap-1">
      <m.span
        key={color}
        initial={{ scale: 0.6, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="block rounded-full ring-2 ring-white/70 shadow-lg"
        style={{ width: size, height: size, background: CARD_COLOR_HEX[color] }}
        aria-label={t('activeColor', { color: t(`colors.${color}`) })}
      />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
        {t(`colors.${color}`)}
      </span>
    </div>
  )
}
