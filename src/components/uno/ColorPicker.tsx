import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { CARD_COLOR_HEX, UNO_COLORS } from '../../uno/config'
import type { UnoColor } from '../../uno/types'

/** A four-wedge wild-color chooser. */
export function ColorPicker({ onPick }: { onPick: (color: UnoColor) => void }) {
  const { t } = useTranslation('uno')
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('chooseColor')}>
      {UNO_COLORS.map((color, i) => (
        <m.button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.04 * i, type: 'spring', stiffness: 300, damping: 18 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          aria-label={t(`colors.${color}`)}
          className="h-20 w-20 rounded-2xl ring-2 ring-white/70 shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ background: CARD_COLOR_HEX[color] }}
        />
      ))}
    </div>
  )
}
