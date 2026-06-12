# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # tsc -b (type-check, project refs) + vite build → dist/
npm run lint         # eslint over the repo
npm run test         # vitest run (one-shot)
npm run test:watch   # vitest watch mode
```

Run a single test file or filter by name:

```bash
npx vitest run src/game/rules.test.ts
npx vitest run -t "bounces back past 100"
```

Vitest is configured in `vite.config.ts` (not a separate config): `environment: 'node'`,
and it only picks up `src/**/*.test.ts`. Tests cover pure logic only — there is no DOM/component
testing setup, so keep new tests free of React/DOM.

## Architecture

The governing rule is **pure game logic is fully decoupled from React, from animation timing, and
from networking.** When adding behavior, decide which layer it belongs to and keep the boundaries
intact rather than reaching across them.

### Layers (inner → outer)

- **`src/game/`** — pure, framework-free, deterministic. Decides *what happens*, never touches the
  DOM, timers, or randomness.
  - `config.ts` is the single source of truth for tunables: the snake/ladder map, palette, board
    size, and all animation durations (`TIMING`). Change game feel here, not in components.
  - `rules.ts` — `rollDie(rng?)` (injectable RNG, so tests are deterministic) and `resolveTurn()`,
    which returns a `TurnResolution`: the *complete* outcome of one roll (walk path, bounce, jump,
    final position, win, extra-turn).
  - `gameReducer.ts` — pure phase machine (`setup → idle → rolling → moving → celebrating → won`).
    It only *applies* an already-resolved `TurnResolution`; it computes no rules and runs no async.
    `celebrating` is the pause after a mid-game finish (3–4 players): the finisher joins
    `finishedOrder` (the podium) and the host decides continue/end. Besides rolls, two more
    sequence-stamped events commit through the same `turnCount` ordering: `SKIP_TURN` (the current
    player left an online room) and `CONTINUE_MATCH`/`END_MATCH`.
  - `types.ts` — shared domain shapes. `TurnResolution` is the key contract: it is computed once
    and replayed identically on every client.

- **`src/lib/turnSequencer.ts`** — the framework-free **sequencing core** shared by both games'
  hooks (unit-tested in `turnSequencer.test.ts`). It owns the online-sync protocol mechanics:
  sequence numbers, duplicate/gap detection, the one-at-a-time event queue, run cancellation, the
  local-roll re-entrancy lock, and the settled-state (`busy`) probe. The drain also **gates each
  queued event on the previous event's commit being visible in game state** (React renders
  asynchronously, so a burst of queued events could otherwise outrun the render flush); if a commit
  never lands it abandons the queue and fires `onOutOfSync`.

- **`src/hooks/useSnakesAndLadders.ts`** — the **orchestration facade**, and the *only* place that
  mixes the reducer, rules, sound, and animation timing. Components depend on the object it returns
  (`GameController`), never on the reducer/rules/timers directly. `useLudo.ts` mirrors it for Ludo;
  both delegate everything protocol-shaped to the shared turn sequencer and keep only their
  game-specific parts (rules calls, animation beats, sounds).
  - A turn runs as an async sequence (`executeTurn`): tumble dice → walk cell-by-cell → take
    snake/ladder → commit. The sequencer's run token (`alive`) invalidates an in-flight sequence on
    reset/restart.
  - `controlsPlayer` gates who may roll: `'all'` for local hot-seat, or a specific player index for
    online (you can only roll on your turn).
  - The same `executeTurn` drives both local rolls and remote rolls. A local roll fires
    `hooks.onLocalTurn(resolution)` to broadcast; remote rolls arrive via `applyRemoteTurn`, which
    **queues** them and drains one at a time (so back-to-back 6s stay in sync even if animation lags).

- **`src/net/`** — realtime multiplayer, behind a transport-agnostic interface. The game talks to a
  `Transport` (`types.ts`), never to Supabase directly.
  - Two transports implement the same interface: `supabaseTransport.ts` (cross-computer, Supabase
    Realtime broadcast + presence) and `broadcastTransport.ts` (same-browser `BroadcastChannel` dev
    fallback). `useRoom.ts` picks one: Supabase when keys are present, else the BroadcastChannel
    fallback in dev only.
  - `useOnlineMatch.ts` — the **game-agnostic half of an online room**, generic over the per-turn
    resolution `R` and the per-seat state `S`: self-healing sync (ping/request/state with host
    tie-break), host migration, late-joiner approval, presence skips/forfeits, notices, and emoji
    reactions. `OnlineRoom` (Snakes) and `LudoOnlineRoom` are thin shells over it — each supplies
    its game controller, a small `OnlineMatchAdapter` (seat state to/from `S`), and the screens to
    render. Adding a third online game means writing exactly that much.
  - `roster.ts` — pure room rules (capacity `MAX_PLAYERS=4`/`MIN_PLAYERS=2`, name/color uniqueness,
    seat ordering, lock-out of late joiners). It is **eventually consistent by construction**: every
    client publishes the same per-member data via presence and folds the roster with identical pure
    rules, so all clients reach the same seats/rejections without a server arbiter.
  - There is **no authoritative server and no database** — only Realtime broadcast/presence channels.
    Clients stay in sync because they replay the same `TurnResolution`, not because a server validates.

- **`src/components/`** — thin presentational React. `App.tsx` is the **Snakes & Ladders shell** at
  `/snakes` — a 3-mode switch (`menu | local | online`); `OnlineGame` (and the Supabase SDK) is
  `lazy`-loaded so local play never pays for it. Board/dice/online subtrees live in
  `components/board/`, `components/dice/`, `components/online/`. Shared shell pieces — `HomeHub` (the
  hub landing), `Backdrop` (the gradient/blob chrome every route renders inside), and
  `BackToHubLink` — sit at the top of `components/`.

### Routing & the multi-game hub

The app is **"Robin's Games," a multi-game hub.** `src/main.tsx` is the bootstrap (`createRoot`);
`src/Root.tsx` holds the `<BrowserRouter>` and gives each game its own route:

- `/` → `HomeHub` — the data-driven landing (a `GAMES` array → animated `<Link>` cards; add a game
  by adding one array entry).
- `/snakes` → `App` — the Snakes & Ladders 3-mode switch, **unchanged internally** (it only moved
  off `/`).
- `/ludo` → `LudoApp` — **lazy-loaded** (`React.lazy` + `Suspense`) so its chunk never loads on `/`
  or `/snakes`. Placeholder today; the real game replaces it in a later phase.
- `*` → redirect to `/`.

Per-route SEO is a dependency-free hook, `src/lib/useDocumentMeta.ts`: each route component calls it
with its own title/description, and it sets `document.title`, the meta description, the
`<link rel="canonical">`, and the OG/Twitter title/description mirrors. Netlify's SPA fallback
(`/* → /index.html`) serves deep links to `/snakes` and `/ludo` unchanged.

### Adding a new game action

A new kind of move generally touches three files in order: extend `TurnResolution`/`resolveTurn`
(`game/rules.ts` + `types.ts`) → handle it in `executeTurn`'s animation sequence
(`hooks/useSnakesAndLadders.ts`) → render it (`components/`). If the new state must survive a remote
turn, it must be carried inside `TurnResolution`, since that payload is the entire over-the-wire
contract.

## Environment & online play

- `.env.local` (gitignored) holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — **public**
  client keys for Supabase Realtime; see `.env.example`. No keys are required to develop: online mode
  falls back to the same-browser BroadcastChannel test mode (open two tabs).
- `isSupabaseConfigured` (`net/config.ts`) is the single check for "are real keys present"; online is
  enabled when configured *or* in dev.

## Stack notes

- React 19, TypeScript ~6, Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite`, configured in CSS — no
  `tailwind.config`), `motion` (Framer Motion) for animation, `d3-shape` for snake curves.
- Animations use `m.*` components under a single `LazyMotion features={domAnimation} strict`
  provider in `Root.tsx` — never import `motion.*` (strict mode throws in dev); this keeps the full
  Motion feature-set out of the main bundle.
- Sound is fully synthesized in `audio/soundEngine.ts` via the Web Audio API — there are no audio
  asset files.
- Deploys to Netlify (`netlify.toml`): `npm run build` → `dist/`, with an SPA fallback redirect.
