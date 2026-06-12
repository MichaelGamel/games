import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LazyMotion, domAnimation } from 'motion/react'
import { useTranslation } from 'react-i18next'
import App from './App'
import { HomeHub } from './components/HomeHub'
import { Backdrop } from './components/Backdrop'

// Each game (and everything it pulls in) loads only when its route is visited,
// so the hub and Snakes initial bundles never pay for the others.
const LudoApp = lazy(() =>
  import('./components/ludo/LudoApp').then((m) => ({ default: m.LudoApp })),
)
const FourApp = lazy(() =>
  import('./components/four/FourApp').then((m) => ({ default: m.FourApp })),
)
const UnoApp = lazy(() =>
  import('./components/uno/UnoApp').then((m) => ({ default: m.UnoApp })),
)

function RouteFallback() {
  const { t } = useTranslation()
  return (
    <Backdrop>
      <div className="relative z-10 grid min-h-screen place-items-center text-white/70">
        {t('loading')}
      </div>
    </Backdrop>
  )
}

/**
 * The "Robin's Games" router: the hub at `/`, and each game on its own route.
 * Snakes (`/snakes`) is eager; Ludo (`/ludo`) is lazy so its chunk never loads
 * on the hub or Snakes. Unknown paths fall back to the hub.
 *
 * `LazyMotion` + the `m.*` components (used everywhere instead of `motion.*`)
 * keep the full Motion feature-set out of the bundle — only the `domAnimation`
 * subset ships. `strict` makes any stray `motion.*` usage throw in dev so the
 * saving can't silently regress.
 */
export function Root() {
  return (
    <LazyMotion features={domAnimation} strict>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeHub />} />
          <Route path="/snakes" element={<App />} />
          <Route
            path="/ludo"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LudoApp />
              </Suspense>
            }
          />
          <Route
            path="/four"
            element={
              <Suspense fallback={<RouteFallback />}>
                <FourApp />
              </Suspense>
            }
          />
          <Route
            path="/uno"
            element={
              <Suspense fallback={<RouteFallback />}>
                <UnoApp />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LazyMotion>
  )
}
