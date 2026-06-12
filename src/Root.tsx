import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
 */
export function Root() {
  return (
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
  )
}
