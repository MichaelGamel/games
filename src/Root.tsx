import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LazyMotion, domAnimation } from 'motion/react'
import App from './App'
import { HomeHub } from './components/HomeHub'
import { Backdrop } from './components/Backdrop'

// Ludo (and everything it will pull in) loads only when /ludo is visited, so the
// hub and Snakes initial bundles never pay for it.
const LudoApp = lazy(() =>
  import('./components/ludo/LudoApp').then((m) => ({ default: m.LudoApp })),
)

function RouteFallback() {
  return (
    <Backdrop>
      <div className="relative z-10 grid min-h-screen place-items-center text-white/70">Loading…</div>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LazyMotion>
  )
}
