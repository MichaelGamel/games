# Plan: Add a Ludo game at `/ludo`

> **This plan document will itself be saved into the repo at `_plans/ludo.md`** as the
> first execution step (a new top-level `_plans/` directory).

## Context

The repo is a polished single-game **Snakes & Ladders** app with a deliberately layered
architecture: pure deterministic game logic (`src/game/`) → a single orchestration facade
(`src/hooks/useSnakesAndLadders.ts`) → transport-agnostic networking (`src/net/`) → thin React
components (`src/components/`). Today `App.tsx` renders the Snakes app at the root and there is no router.

The project is being **rebranded into a multi-game hub, "Robin's Games."** The landing page at `/`
becomes a games hub offering **Snakes & Ladders** and a brand-new **Ludo** game, with room to add
more games later — **every game lives on its own route** (`/snakes`, `/ludo`, …). This plan delivers
the rebrand first (Phase 0), then builds the full Ludo game to the same standard as Snakes, with
heavy kid-and-adult-pleasing animation.

### Confirmed scope decisions
1. **Local + online multiplayer** — reuse the existing `src/net/` transport layer (Supabase Realtime
   cross-computer + BroadcastChannel same-browser dev fallback), rooms/roster/presence/sync.
2. **Routing** — add `react-router-dom`. `/` = Robin's Games hub; `/snakes` = existing Snakes app
   (logic untouched); `/ludo` = new game (lazy-loaded).
3. **Blocks** — implement the spec's *recommended stationary block*: two same-color tokens on one
   shared-track square form a wall opponents can't pass through or land on; it stays until one token
   moves off. Own tokens pass their own block; blocks/captures exist only on the shared ring, never in
   private home columns.
4. **Ending** — continue for full ranking: first to bring all 4 tokens home wins, the rest keep playing
   for 2nd/3rd/4th, mirroring the existing `celebrating`/`finishedOrder` podium.

The governing constraint: **do not change Snakes *game* behavior.** Snakes' `game/`, hook, and gameplay
components stay byte-for-byte intact; it simply moves from `/` to `/snakes`. Shared-infra edits are
additive/generic (net layer type params, three new sound methods, two optional component props).

---

# PHASE 0 — Rebrand to "Robin's Games": hub landing, per-game routes, SEO

**Goal:** a multi-game shell. `/` shows the Robin's Games hub; Snakes moves to `/snakes` unchanged;
`/ludo` is wired (initially to a placeholder, replaced in later phases). SEO/branding updated.

1. **Save this plan** to `_plans/ludo.md` in the repo root (create the `_plans/` directory).
2. **Add `react-router-dom`** (`npm i react-router-dom`).
3. **`src/main.tsx`** — wrap in `<BrowserRouter>` with:
   - `/` → `<HomeHub/>`
   - `/snakes` → `<App/>` (the existing Snakes 3-mode switch, unchanged internally)
   - `/ludo` → `<Suspense><LudoApp/></Suspense>`, `LudoApp` lazy-loaded (placeholder in Phase 0; real in Phase 4)
   - `*` → redirect to `/` (catch-all).
4. **`src/components/HomeHub.tsx`** (new) — the "Robin's Games" landing. Reuse `App.tsx`'s backdrop
   chrome (panning gradient + floating blobs) for brand consistency. Render a **data-driven `GAMES`
   array** (`{ id, title, tagline, emoji, to, accent }`) so future games are one array entry. Each
   game is an animated `<Link>` card (`motion` enter/hover, staggered). Header: "🎲 Robin's Games".
   Cards: **Snakes & Ladders → `/snakes`**, **Ludo → `/ludo`**.
5. **Snakes back-affordance** — `App.tsx` stays the Snakes 3-mode switch; add a back-to-hub
   `<Link to="/">` ("← Robin's Games") in `src/components/MainMenu.tsx` (additive, no behavior change).
6. **SEO / metadata** (`index.html` + a tiny per-route hook):
   - `index.html`: `<html lang="en">`, `<title>Robin's Games</title>`, meta `description`,
     `theme-color`, Open Graph (`og:title`/`og:description`/`og:type`/`og:url`), Twitter card tags,
     and a `<link rel="canonical">`. Update the favicon (emoji/data-URI 🎲 or keep existing asset).
   - `src/lib/useDocumentMeta.ts` (new, no dependency) — a hook that sets `document.title` and updates
     the `<link rel="canonical">` href per route (`origin + pathname`). Each route component
     (`HomeHub`, Snakes `App`, `LudoApp`) calls it with its own title/description so per-game SEO is
     correct: e.g. "Snakes & Ladders — Robin's Games", "Ludo — Robin's Games".
7. **Project rename** — `package.json` `"name"` → `robins-games`; update `README.md` (project title,
   description, the games list, routes) and `CLAUDE.md` (architecture notes: router + hub + per-game
   routes; clarify Snakes lives at `/snakes`). `netlify.toml`'s SPA fallback (`/* → /index.html 200`)
   already serves deep links — no change.

**Verify Phase 0:** `npm run build` green; `npm run dev` → `/` shows the hub, `/snakes` is the
unchanged Snakes game (menu/local/online all work), `/ludo` loads the placeholder, deep-linking
`/snakes` and `/ludo` works, document title + canonical change per route.

---

# PHASE 1 — Net layer genericization (shared infra prep)

Make `src/net/` payload-generic so Ludo can reuse it without regressing Snakes. Today
`src/net/types.ts` hardcodes the Snakes shape (`turn` carries `resolution: TurnResolution`;
`RunningSnapshot.positions: number[]`) and both transports + `useRoom.ts` hardcode the channel
prefix `sl-room-`.

- `RoomMessage<R = TurnResolution, S = number>`, `RunningSnapshot<S = number>`, `Transport<…>`,
  `TransportArgs`, `TransportFactory`, `TransportHandlers`, `useRoom<R, S>` — `R` = per-turn
  resolution payload, `S` = per-seat board state. Snakes imports with no args resolve to today's
  exact types → **zero Snakes call-site changes**.
- Add `channelPrefix?: string` to `TransportArgs` / `useRoom` (default `'sl-room'`); both transports
  build `${channelPrefix ?? 'sl-room'}-${code}`. Ludo passes `'lr-room'` → separate channel namespace,
  so Snakes and Ludo tabs on the same code never cross-talk. One transport, one self-healing sync, one roster.

Files: `src/net/types.ts`, `src/net/supabaseTransport.ts`, `src/net/broadcastTransport.ts`,
`src/net/useRoom.ts` (additive generic signatures only). `roster.ts`/`roster.test.ts` are already
game-agnostic — reused verbatim.

**Verify Phase 1:** `npm test` + `npm run build` green with **zero Snakes logic changes** before any
Ludo code exists.

---

# PHASE 2 — Ludo pure logic (`src/ludo/`, deterministic)

Build the framework-free core + tests. See **Ludo design reference** below for the exact contracts.

- `config.ts` — palette (`LUDO_COLORS`), geometry constants (`START_OFFSETS=[0,13,26,39]`,
  `RING_COORDS` [52 hand-authored cells], `HOME_COLUMN_COORDS`, `HOME_GOAL_COORDS`, `BASE_NEST_COORDS`,
  `SAFE_CELLS={0,13,26,39,8,21,34,47}`), and `TIMING`.
- `board.ts` — `tokenCoords`, `tokenPercent`, `mainTrackCell`, `isSafe`, `cellsInRenderOrder` (+ `board.test.ts`).
- `types.ts` — `LudoPlayer`, `LudoPhase`, `GameState`, `TokenMoveOption`, `LudoTurnResolution` (wire contract).
- `rules.ts` — `rollDie(rng?)`, `legalMoves(state, seat, roll)`, `resolveLudoMove(state, tokenId, roll)` (+ `rules.test.ts`).
- `ludoReducer.ts` — pure phase machine + ranking + sync-determinism (+ `ludoReducer.test.ts`).

**Verify Phase 2:** `npm test` green (all new Ludo tests + existing tests).

---

# PHASE 3 — Sound + orchestration facade

- `src/audio/soundEngine.ts` — **additively** add `playRelease()`, `playCapture()`, `playHomeArrival()`.
  Existing methods untouched (Snakes unaffected).
- `src/hooks/useLudo.ts` — mirror `useSnakesAndLadders.ts` (reducer + refs + queue/drain/seq/runId +
  `controlsPlayer` + reduced-motion timing + flashes). New: the local-only **selection pause** and
  `selectableTokens`/`selectToken`. See reference below for the `executeTurn` sequence.
- `src/hooks/useLudoBotAutoPlay.ts` — drives both `roll()` and `selectToken()` for bots (heuristic:
  capture > release > furthest token; deterministic).

**Verify Phase 3:** `npm run build` (types) green.

---

# PHASE 4 — Ludo UI + local play end-to-end

`src/components/ludo/`: `board/LudoCell`, `board/LudoBaseNest`, `board/LudoToken`, `board/LudoBoard`,
`dice/LudoDice` (wraps shared `Dice3D`), `LudoControls`, `LudoPlayerPanel`, `LudoSelectionHint`,
`LudoGameScreen`, `LudoSetupScreen`, `LudoLocalGame`, `LudoMainMenu`, `LudoApp` (replaces the Phase 0
placeholder; calls `useDocumentMeta`; has a back-to-hub link). Additive props:
`CelebrationOverlay` gains `message?`; reuse `WinnerOverlay`/`Confetti`/`Dice3D` verbatim. See
reference below for animation detail.

**Verify Phase 4:** `npm run dev` → local Ludo (2–4 players + bots) plays start-to-finish with all
animations; ranking podium works.

---

# PHASE 5 — Ludo online multiplayer

`src/components/ludo/online/LudoOnlineGame.tsx` + `LudoOnlineRoom.tsx` mirror
`OnlineGame`/`OnlineRoom`; wire `useLudo` to `useRoom<LudoTurnResolution, LudoSeatState>({
channelPrefix: 'lr-room', … })`. Reuse `OnlineLobby` (additive `colors?` prop → `LUDO_COLORS`). Copy
the entire self-healing sync (sync-ping/request/state, `SKIP_GRACE_MS`, `FORFEIT_GRACE_MS`, host-wins
divergence, late-joiner approval, presence notices); only the resolution type, per-seat snapshot
(`tokens: number[]` + `consecutiveSixes`), and divergence comparison (token arrays) differ.

**Verify Phase 5:** multi-tab online via BroadcastChannel (no Supabase keys) — capture, six-chains,
late join, leave/skip, resync all stay in sync.

---

# PHASE 6 — Final integration & verification

- `npm test` — all Ludo `.test.ts` + Snakes/roster tests green.
- `npm run build` — `tsc -b && vite build`; confirm Ludo is a separate lazy chunk and the `/` + `/snakes` initial bundles don't load Ludo code.
- `npm run lint`.
- `npm run dev` — full pass: hub `/`, Snakes `/snakes` unchanged, Ludo `/ludo` local + online, SEO per route, deep links under Netlify SPA redirect.

---

# Ludo design reference (details for Phases 2–5)

### Core state model & wire contract
**Token progress** — one integer per token (4/player): `-1` base; `0..50` own view of the shared ring
(0 = own entry); `51..55` private home column; `56` completed (immovable/uncapturable). Shared cell on
the ring: `absCell = (START_OFFSETS[seat] + progress) % 52`. Home columns/completion are private →
blocks/captures only touch `progress 0..50`. Move: `to = from + roll`; release only on `roll===6` →
`to=0`; **exact finish** — `to>56` illegal, `to===56` completes.

**`legalMoves(state, seat, roll)`** (pure): skip completed tokens; require 6 to release; reject
overshoot; reject any move whose path **passes through or lands on an opponent block** (own block
doesn't block self); flag capture when the landing shared cell holds exactly one opponent and isn't a
safe cell.

**`LudoTurnResolution`** (computed once on the acting client; broadcast; replayed identically):
`{ seat, roll, tokenId, from, to, releasedFromBase, stepPath, captures[], reachedHome, isWin,
extraTurn, sixCount, noMove }`. Explicit `tokenId` is the crux — remote clients replay without
re-deciding. A no-move path (`noMove:true, tokenId:-1`) covers "no legal move" and "third six".

**Phase machine:** `setup → idle → rolling → selecting → moving → celebrating → won`. `selecting` is
**local-only**: >1 legal move → highlight + wait for tap; exactly one → auto-select; zero → no-move.
**Extra turn:** `(roll===6 && sixCount<3 && !isWin) || (captures.length>0 && !isWin)`. Third
consecutive six → no-move that ends the turn (first two moves stand). `consecutiveSixes` lives in the
resolution (`sixCount`) so the reducer stays a pure function of `(state, resolution)`.

**Reducer actions** mirror Snakes: `START_GAME`, `ADD_PLAYER`, `LOAD_SNAPSHOT`, `BEGIN_ROLL`,
`BEGIN_SELECT` (new), `BEGIN_MOVE`, `COMMIT_TURN`, `SKIP_TURN`, `CONTINUE_MATCH`, `END_MATCH`,
`FORFEIT_WIN`, `RESET`. `COMMIT_TURN` applies move + captures (opponents → -1) + completion, updates
`finishedOrder`/`winnerId`, sets `consecutiveSixes`, advances via `nextActiveIndex` unless `extraTurn`,
increments `turnCount` every committed event. Seat finishes when all 4 tokens === 56; phase → `won`
when ≤1 active seat remains, else `celebrating`.

### Board geometry
Standard 15×15 cross. **Hand-author** `RING_COORDS` (52 ordered `{row,col}`, index 0 = seat-0 entry),
`HOME_COLUMN_COORDS[seat][0..4]`, `HOME_GOAL_COORDS[seat]`, `BASE_NEST_COORDS[seat][0..3]`,
`SAFE_CELLS`. `tokenCoords(seat,tokenId,progress)` dispatches on the bucket;
`tokenPercent` → `{x:(col+0.5)*100/15, y:(row+0.5)*100/15}`. `board.test.ts` asserts ring connectivity
(52 unique adjacent cells), per-seat start mapping, no ring/home/base overlap, safe-cell membership.

### `useLudo` facade — `executeTurn(resolution)`
`BEGIN_ROLL` → tumble dice → (no-move: short handoff, commit, return) → `BEGIN_MOVE` → (if
`releasedFromBase`: pop to progress 0, `playRelease`) → step `stepPath` cell-by-cell (`playStep`, await
`stepMs`) → (captures: `playCapture`, fly captured tokens to base nests, await `captureMs`) →
(`reachedHome`: `playHomeArrival` sparkle) → handoff → clear `activeMove` + `COMMIT_TURN` (batched) →
`playWin` or `playExtraTurn` + flash. Remote turns flow straight through the queue into `executeTurn`
(never enter `selecting`). Reuse `enqueueSequenced`/`applyRemoteTurn`/`applySkip`/`applyRemoteDecision`/
`drainQueue`/`loadSnapshot`/`forfeitWin`/`syncStatus` verbatim.

### Components — animation detail
- **`LudoBoard`** — `relative aspect-square`; `grid` static layer (225 `LudoCell`s, inline
  `gridTemplateColumns: repeat(15,1fr)`) drawing 4 colored quadrants, white cross track, colored home
  columns, safe stars, center home triangle; un-clipped absolute token layer positioned by
  `tokenPercent`, co-located tokens fanned in a small cluster (generalize Snakes' 2-token offset to up to 4).
- **`LudoToken`** — two-layer `motion.div` (outer `left/top` %, inner flourish). Spring
  `{stiffness:700,damping:30,mass:0.7}` hops; eased cubic-bezier for capture fly-back + base-release
  pop. Selectable: pulsing ring (`animate-pulse-ring`), real clickable button, `aria-label`. Heavy
  flourishes: per-step hop, capture "kick" arc to base, home-arrival sparkle, bounce when selectable.
- **`LudoGameScreen`** — mirror `GameScreen`: header, `LudoPlayerPanel` (4 token chips + "home n/4"
  bar + medal on finish via `lib/place.ts`), `LudoBoard`, `LudoControls` (roll disabled during
  `selecting`), keyboard roll, lucky-6 banner, `LudoSelectionHint` ("Tap a glowing token") when
  `selecting` & my turn.

### Tests (node env, pure logic)
- **rules**: RNG determinism; release only on 6; exact-roll-to-home + overshoot blocked; capture lists
  + extra turn; safe-square coexistence (no capture); block prevents pass AND land (own block doesn't);
  three sixes → no-move (prior moves stand); no legal move → `[]` → no-move; per-seat path mapping.
- **board**: ring connectivity; `tokenCoords` per bucket; no overlap; safe-cell set.
- **ludoReducer**: `START_GAME` seats N×4 tokens at -1; `COMMIT_TURN` move/capture/completion,
  extra-turn keeps seat, `turnCount` increments every event; win/ranking parity with Snakes;
  `nextActiveIndex` skips finished seats; **online-sync determinism** (two states + same resolution
  sequence incl. six-chain + capture → byte-identical).

### Risks & mitigations
- **52-cell ring correctness (highest):** hand-author + assert connectivity/per-seat start in
  `board.test.ts` before any UI.
- **Net refactor regressing Snakes:** type-param defaults resolve to current Snakes shapes; gate Phase
  1 on green Snakes tests/build.
- **Rebrand breaking Snakes routing:** Snakes' internal state machine is unchanged; it only moves from
  `/` to `/snakes`. Verify all three modes after Phase 0.
- **Selection over the wire:** explicit `tokenId`; remote never enters `selecting`; covered by the
  reducer sync-determinism test.
- **Three-sixes + capture-extra-turn:** `sixCount` in the resolution keeps the reducer pure; test the chain.
