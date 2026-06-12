import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Backdrop } from '../Backdrop'
import { BackToHubLink } from '../BackToHubLink'
import { useDocumentMeta } from '../../lib/useDocumentMeta'

/**
 * The UNO game shell at `/uno`.
 *
 * Phase 0 placeholder: it claims the route, wires per-route SEO and the
 * back-to-hub affordance, and renders a "coming soon" card. The full 3-mode
 * switch (local vs bots / hot-seat / online) replaces this in Phase 4.
 */
export function UnoApp() {
  const { t } = useTranslation(['uno', 'common'])
  useDocumentMeta({
    title: t('uno:metaTitle'),
    description: t('uno:metaDescription'),
  })

  return (
    <Backdrop>
      <BackToHubLink />
      <m.main
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <m.span
          aria-hidden="true"
          className="text-7xl drop-shadow"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          🃏
        </m.span>
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow sm:text-5xl">
          {t('uno:title')}
        </h1>
        <p className="max-w-sm text-white/70">{t('uno:comingSoon')}</p>
      </m.main>
    </Backdrop>
  )
}
