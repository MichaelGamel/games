# Plan: Add an UNO game at `/uno`

## Context

"Robin's Games" is a multi-game hub (`src/Root.tsx` router → `/` hub, `/snakes`, `/ludo`, `/four`).
Every game follows one deliberately layered architecture: pure deterministic logic (`src/game/`,
`src/ludo/`, `src/four/`) → a single orchestration facade hook (`src/hooks/useXxx.ts`) →
transport-agnostic networking (`src/net/`) → thin React components. We are adding **UNO** as a new
game on its own route `/uno`, built to the same standard, lazy-loaded so the hub/other routes never
pay for it.

UNO is materially different from the existing board games in one way: it has **hidden hands** and a
**shuffled deck**. The existing online model broadcasts fully-public state and every client replays
the same `*TurnResolution` to reach identical state — there is **no authoritative server**.

### Confirmed scope decisions

1. **Online secrecy = deterministic seed (peer-replay).** The host broadcasts a **deck seed** in
   `start` (exactly how Snakes broadcasts a board seed). Every client shuffles the same 108-card deck
   with `mulberry32` (reuse `src/game/boardGen.ts`), so all clients hold identical stock/hands/discard
   and stay in sync by replaying public moves. The UI renders **only your own hand face-up**; hands
   are hidden in the UI, not cryptographically (a devtools snoop could read them — acceptable for a
   friends' hobby game). **This reuses the entire net/sequencer/roster stack unchanged** and keeps
   host-migration working (no single client owns secret truth). A pleasant side effect: **WD4
   challenge adjudication is deterministic** — every client can already see whether the WD4 player
   held a matching color, so the challenge result needs no extra negotiation.
2. **All three play modes:** local **vs bots**, local **hot-seat** (multiplayer on one device, with a
   "pass the device" privacy hand-off so hands stay hidden), and **online** (humans). Bots are a
   local-mode feature, consistent with the other games.
3. **All optional house rules**, each a setup toggle: **Stacking** (Draw Two on Draw Two, WD4 on WD4),
   **WD4 Challenge**, **Seven-Zero** (7 = swap hand with a chosen player, 0 = rotate all hands), and
   **Jump-In / Multi-play** (identical-card out-of-turn play; lay multiple identical cards at once).
4. **Up to 6 players** online; **both win modes** — Single-Round (first to empty hand) and
   Score-to-target (200/300/500), chosen at setup.

The governing constraint, as with Ludo: **do not change Snakes/Ludo/Four behavior.** All shared-infra
edits are additive and generic (one new optional snapshot field, a threaded `maxPlayers`, new sound
methods, a new locale namespace). Existing games resolve to today's exact types/behavior.

---

# PHASE 0 — Register UNO on the hub (route, card, SEO, i18n + stats scaffolding)

**Goal:** `/uno` exists (placeholder, replaced in Phase 4), appears on the hub, has SEO + locale
namespaces wired. No game logic yet.

1. **Save this plan** to `_plans/uno.md`.
2. **`src/Root.tsx`** — add `const UnoApp = lazy(() => import('./components/uno/UnoApp')…)` and a
   `/uno` route inside `<Suspense>`, mirroring `/ludo`. Catch-all `*` redirect already covers it.
3. **`src/components/HomeHub.tsx`** — add one entry to the `GAMES` array:
   `{ id:'uno', title:t('uno:title'), tagline:t('uno:tagline'), emoji:'🃏', to:'/uno', accent:'…' }`.
4. **i18n scaffolding** — create `src/locales/en/uno.json` + `src/locales/ar/uno.json` (start with
   `title`, `tagline`, `metaTitle`, `metaDescription`); register both in `src/i18n.ts` (`resources` +
   `ns` array) and add `uno: typeof import('./locales/en/uno.json')` to `src/i18next-types.ts`.
   `src/locales/parity.test.ts` then enforces EN/AR key parity automatically.
5. **Stats** — add `'uno'` to the `GameId` union in `src/lib/stats.ts` (per-game counters accumulate
   with no migration).
6. **SEO** — `UnoApp` (placeholder) calls `useDocumentMeta` (`src/lib/useDocumentMeta.ts`) with the
   UNO title/description; add a back-to-hub `<BackToHubLink/>`.

**Verify Phase 0:** `npm run build` green; `/` shows the UNO card; `/uno` loads the placeholder as a
separate lazy chunk; document title/canonical change on the route; `npm test` (parity) green.

---

# PHASE 1 — Net layer prep (shared infra, additive & generic)

The wire types are **already** generic over `R` (per-turn resolution) and `S` (per-seat state) from
the Ludo work. UNO needs two small additive changes:

- **Per-seat capacity.** Today `MAX_PLAYERS=4` lives in `src/game/config.ts`; `useOnlineMatch` and
  `roster.computeRoster` already accept a `maxPlayers` parameter. Define `UNO_MAX_PLAYERS=6` in
  `src/uno/config.ts` and thread it through `useRoom`/`useOnlineMatch`/roster for UNO **only** (Snakes
  & Ludo keep passing 4). Confirm no call site hardcodes the constant past the parameter boundary.
- **A game-specific snapshot blob.** UNO has *global* state that doesn't fit `RunningSnapshot`'s fixed
  per-seat `positions: S[]` shape (the stock, discard, active color, direction, pending-draw counter,
  per-seat scores, round number, deck seed). Extend the snapshot generically:
  `RunningSnapshot<S = number, G = undefined>` gains an optional `shared?: G`. Snakes/Ludo/Four pass
  nothing (default `undefined`) → **zero changes**. UNO fills `shared` so a late-joiner / resync
  rebuilds the full deterministic state. `sync-ping` stays cheap (compares hand counts + `turnCount` +
  `matchId`); the full `shared` blob rides only on `sync-state` and `add-player` snapshots.
- **Channel namespace.** UNO passes `channelPrefix:'uno-room'` (the mechanism already exists) so UNO
  and other games never cross-talk on the same room code.

Files: `src/net/types.ts`, `src/net/useOnlineMatch.ts`, `src/net/useRoom.ts`, `src/net/roster.ts`
(signature/threading only). `roster.test.ts` runs unchanged.

**Verify Phase 1:** `npm test` + `npm run build` green with **zero behavior change** to Snakes/Ludo/Four
before any UNO game code exists.

---

# PHASE 2 — UNO pure logic (`src/uno/`, deterministic)

Framework-free core + tests (node env, no React/DOM). See **UNO design reference** below for exact
contracts.

- `deck.ts` — the canonical 108-card deck builder; `shuffle(seed)` (Fisher–Yates over `mulberry32`),
  `deal(deck, playerCount)`, and deterministic `reshuffleDiscard(discard, reshuffleCount)` for an
  exhausted stock. (+ `deck.test.ts`: exactly 108 cards with correct multiplicities; same seed →
  same order; deal gives 7/player + a legal start card.)
- `config.ts` — `UNO_COLORS` (red/blue/green/yellow + wild), `UNO_MAX_PLAYERS=6`/`MIN=2`, default
  `UnoRules` (all house-rule toggles + win mode + target), scoring values (number = face, action = 20,
  wild = 50), and `TIMING`.
- `types.ts` — `UnoCard`, `UnoColor`, `UnoValue`, `UnoPhase`, `UnoGameState`, `UnoSeatState`,
  `UnoRules`, and `UnoTurnResolution` (the wire contract).
- `rules.ts` — `legalPlays(hand, top, activeColor, pending, rules)`, `resolvePlay(state, card, opts)`,
  `resolveDraw(state, count, opts)`, `adjudicateChallenge(state)`, `scoreHand(hand)`,
  `scoreRound(state)`. (+ `rules.test.ts`.)
- `unoReducer.ts` — pure phase machine + rounds + house-rule effects + sync-determinism
  (+ `unoReducer.test.ts`).
- `recap.ts` — `summarizeUno(log)` (cards played, draws, skips/reverses, wilds, UNO calls/penalties).

**Verify Phase 2:** `npm test` green (all new UNO tests + existing tests).

---

# PHASE 3 — Sound + orchestration facade + bot

- `src/audio/soundEngine.ts` — **additively** add `playCardPlay`, `playDraw`, `playShuffle`,
  `playReverse`, `playSkip`, `playColorPick`, `playUnoCall`, `playPenalty`. Existing methods untouched.
- `src/hooks/useUno.ts` — mirror `useLudo.ts`: reducer + refs + the shared `createTurnSequencer`
  (`src/lib/turnSequencer.ts`) for queue/drain/seq/runId, `controlsPlayer` gate, reduced-motion
  timing, flashes. New game-specific beats: a **local-only `choosing` pause** (wild color pick /
  seven swap-target pick) whose result is baked into the resolution so remotes never re-decide — the
  same trick Ludo uses for `tokenId`. Returns the `UnoController` consumed by components.
- `src/hooks/useUnoBotAutoPlay.ts` — local bot driver (heuristic: prefer a matching number/action,
  dump high-value cards, choose the color you hold most of, declare UNO at one card, challenge a WD4
  when it can already see the bluff). Deterministic given state.

**Verify Phase 3:** `npm run build` (types) green.

---

# PHASE 4 — UNO UI + local play end-to-end (bots + hot-seat)

New `src/components/uno/` (this is the largest new UI surface — cards are fully synthesized
SVG/CSS, matching the repo's no-asset-files ethos):

- **Cards/table:** `board/UnoCard` (face + back, color/value), `board/UnoHand` (fanned, scrollable,
  playable-card highlights + click), `board/DiscardPile`, `board/DrawPile` (tap to draw),
  `board/DirectionIndicator`, `board/ActiveColorChip`, `ColorPicker` (4-wedge wild chooser),
  `UnoCallButton` (declare/catch).
- **Screens/controls:** `UnoControls`, `UnoPlayerPanel` (hand counts, turn marker, UNO badge,
  per-round score), `UnoRulesPicker` (host-only toggles + win mode/target), `UnoGameScreen`,
  `UnoSetupScreen` (players + bots), `UnoLocalGame`, `UnoMainMenu`, `UnoApp` (replaces the Phase 0
  placeholder; 3-mode switch; consumes `?room=CODE` once on mount; `useDocumentMeta`; back-to-hub).
- **Privacy hand-off:** a `PassDeviceScreen` ("Pass to {next} — tap when ready") between hot-seat
  turns so the prior hand is hidden; toggleable ("Private hands"). Bots' hands always face-down.
- Reuse verbatim: `CelebrationOverlay` (round-end, host continue/next-round), `WinnerOverlay`,
  `Confetti`, `Backdrop`, `BackToHubLink`, `PlayerPanel` patterns.

**Verify Phase 4:** `npm run dev` → local UNO (2–6 players, mix of humans + bots) plays a full
round/match: matching rules, action cards, wilds + color pick, draw, UNO declaration + catch penalty,
all enabled house rules, single-round and score-to-target endings.

---

# PHASE 5 — UNO online multiplayer

`src/components/uno/online/UnoOnlineGame.tsx` + `UnoOnlineRoom.tsx` mirror `LudoOnlineGame`/
`LudoOnlineRoom`. Wire `useUno` to `useRoom<UnoTurnResolution, UnoSeatState>({ channelPrefix:'uno-room',
maxPlayers: UNO_MAX_PLAYERS, … })`. Reuse `OnlineLobby` (additive `colors` prop already exists), the
full self-healing sync (sync-ping/request/state, `SKIP_GRACE_MS`, `FORFEIT_GRACE_MS`, host-wins
divergence, late-joiner approval, presence notices, reactions). Supply the `OnlineMatchAdapter`:
`buildSeatStates` → per-seat `{ hand, saidUno, score }`; `applySnapshot` restores both the seat states
**and** `snapshot.shared` (stock/discard/activeColor/direction/pendingDraw/scores/round/seed);
`seatStatesEqual` compares hand counts + discard top + draw index for divergence detection.

**Verify Phase 5:** multi-tab online via BroadcastChannel (no Supabase keys): full match, action
cards, stacking, challenge, seven-zero, late join (gets full `shared` snapshot), leave/skip/forfeit,
deck reshuffle on exhaustion, resync — all stay in sync across tabs.

---

# PHASE 6 — Final integration & verification

- `npm test` — all UNO `.test.ts` + existing tests + EN/AR parity green.
- `npm run build` — confirm UNO is a separate lazy chunk; `/` + `/snakes` initial bundles exclude it.
- `npm run lint`.
- `npm run dev` — full pass: hub, `/uno` local (bots + hot-seat) + online, per-route SEO, deep links
  under the Netlify SPA redirect; Snakes/Ludo/Four unchanged.

---

# UNO design reference (details for Phases 2–5)

### Deck & determinism (the secrecy mechanism)
**108 cards:** per color (R/B/G/Y) one `0`, two each `1–9`, two each Skip/Reverse/Draw-Two = 25×4 =
100; plus 4 Wild + 4 Wild-Draw-Four. Host picks a **deck seed**, broadcast in `start` alongside
`rules`. Every client builds the identical shuffled `stock: UnoCard[]` via `shuffle(seed)` (Fisher–
Yates over `mulberry32` from `src/game/boardGen.ts`), deals 7/player in seat order, and flips the next
card to `discard` (official start-card handling: a Wild-Draw-Four start is reshuffled; a Wild start →
first player chooses color; an action start applies to the first player). State is modeled as explicit
`stock`/`discard` arrays plus per-seat `hand`s — **all derived identically on every client**, so no
card identities ever travel except the public card played. Draws pull off the top of each client's
identical `stock`; when it empties, `reshuffleDiscard(discard, ++reshuffleCount)` rebuilds it
deterministically from the public discard (minus its top), seeded by the reshuffle counter — so every
client reshuffles the same way without a message.

### Core state model & wire contract
`UnoGameState`: `{ phase, players[], hands: UnoCard[][], stock, discard, activeColor, direction (+1/-1),
currentPlayerIndex, pendingDraw, pendingDrawType, reshuffleCount, deckSeed, saidUno: boolean[],
scores: number[], roundNumber, finishedOrder, winnerId, turnCount, rules }`.

`UnoTurnResolution` (computed once on the acting client, broadcast, replayed identically) is a
discriminated union — each carries everything needed for a pure replay, the way Ludo's resolution
carries an explicit `tokenId`:
- `{ kind:'play', seat, cards: UnoCard[], chosenColor?, declaredUno, effect }` — `cards` is one card
  (or several for multi-play); `chosenColor` set for wilds; `effect` records the deterministic
  consequence: direction flip, skip, `penaltyDraw?:{seat,count}`, `sevenSwapTarget?`, `zeroRotate?`,
  `nextIndex`, `isRoundWin`, `extraTurn`.
- `{ kind:'draw', seat, count, thenPlay?: UnoCard|null, chosenColor? }` — voluntary/penalty draw; the
  card identities come deterministically off `stock`, so only the **count** travels.
- `{ kind:'challenge', seat, success, penalty:{seat,count} }` — adjudicated from publicly-known hands.
- `{ kind:'callout', seat, target, penalty:{seat,count:2} }` — caught a missed UNO declaration.

### Phase machine & reducer
**Phases:** `setup → idle → choosing → resolving → roundEnd → matchEnd` (`choosing` is **local-only**:
wild color / seven target / WD4-challenge prompt; remotes skip it). **Actions** mirror the other games:
`START_ROUND` (deal from seed), `BEGIN_PLAY`/`BEGIN_DRAW`, `COMMIT_TURN` (apply the resolution),
`DECLARE_UNO`, `CALL_OUT`, `CHALLENGE`, `SKIP_TURN`, `CONTINUE_MATCH`/`END_MATCH` (here = deal next
round / stop), `LOAD_SNAPSHOT`, `ADD_PLAYER`, `FORFEIT_WIN`, `RESET`. `COMMIT_TURN` is a pure function
of `(state, resolution)` — it mutates hands/stock/discard, applies the action effect, advances
`currentPlayerIndex` by `direction` (skipping per Skip/Draw-Two/WD4), increments `turnCount` on every
committed event. Round ends when a hand hits 0: winner scores Σ opponents' remaining cards
(`scoreHand`); **Single-Round** → `matchEnd`; **Score** → if a player ≥ target → `matchEnd`, else
`roundEnd` pause (reuse the `CelebrationOverlay`/host-decision flow) → `START_ROUND` with a fresh seed
(host broadcasts the next seed).

### House-rule specifics
- **Two-player Reverse** acts as Skip (per spec).
- **Stacking:** `pendingDraw`/`pendingDrawType` accumulate; the target may stack a same-type penalty
  card to pass it on, else draws the total and loses the turn.
- **WD4 Challenge:** legal only when the player has no card of the current color (the rule already
  restricts WD4). On challenge, `adjudicateChallenge` inspects the (publicly-known) prior hand: bluff
  caught → WD4 player draws 4; failed → challenger draws 6. **Deterministic on every client** — a free
  benefit of the seed model.
- **Seven-Zero:** `7` → swap your hand with a chosen player (`sevenSwapTarget` in the resolution);
  `0` → rotate all hands one step in `direction`. Both are deterministic permutations.
- **Jump-In / Multi-play:** Multi-play = a `play` resolution whose `cards` are identical; the last
  card's action applies (or stacks). **Jump-In is the one feature that breaks strict turn order** — a
  non-current seat plays an exact match of the discard top out of turn. Local (hot-seat/bots) is
  trivial. Online, two seats can race for the same jump → handle via the existing seq/`matchId`
  ordering with **host arbitration** (first valid jump-in the host commits wins; losers revert on the
  next sync-ping divergence). Given the race complexity, **jump-in defaults OFF for online rooms** in
  v1 (on for local); document this clearly rather than shipping a flaky interrupt.

### UNO declaration
Playing your second-to-last card surfaces a **Declare UNO** button (auto-armed; bots declare reliably).
If a player reaches 1 card without declaring, opponents get a **Catch!** affordance until the next turn
begins → `callout` resolution → +2 penalty draw. All three (declare/catch/penalty) are ordinary
seq-stamped events.

### Components — animation detail
Cards are CSS/SVG (rounded rect, color field, large centred glyph, oval pip). `UnoHand` fans cards with
`m.*` spring layout, lifts/disables by legality, deals in with stagger. Plays arc to `DiscardPile` with
a slight rotation; draws slide from `DrawPile`; Reverse spins the `DirectionIndicator`; Skip pulses the
skipped seat; wild color pick animates the `ActiveColorChip`; reshuffle does a quick collapse/fan. Use
`m.*` under the existing `LazyMotion` provider — never `motion.*` (strict mode throws).

### Tests (node env, pure logic)
- **deck:** 108 cards with exact multiplicities; same seed → identical order; deal = 7/player + legal
  start; reshuffle determinism (two clients, same `reshuffleCount` → same stock).
- **rules:** legal-play matching (color/number/action/wild); WD4 restriction; challenge adjudication
  both ways; stacking accumulation; seven-swap & zero-rotate permutations; scoring values.
- **unoReducer:** deal seats N hands of 7; `COMMIT_TURN` applies play/draw/effect, direction +
  skip-advance, `turnCount` increments every event; round scoring + Single-Round vs Score transitions;
  **online-sync determinism** (two states + the same resolution sequence, incl. action cards, stacking,
  reshuffle → byte-identical state).

### Risks & mitigations
- **Jump-In online races (highest):** default jump-in OFF online; host-arbitrate + revert-on-divergence
  when enabled; cover the local path with tests.
- **Deterministic reshuffle drift:** the only randomness is `(deckSeed, reshuffleCount)`; assert
  cross-client reshuffle equality in `deck.test.ts` before any UI.
- **Snapshot completeness:** late-joiner correctness depends entirely on the `shared` blob; a joiner
  with `matchLog===null` gets no replay/recap (same as other games) but must get full live state.
- **Net `shared` field regressing other games:** `G` defaults to `undefined`; gate Phase 1 on green
  Snakes/Ludo/Four tests + build before any UNO code.
- **6-seat roster/UI scaling:** thread `maxPlayers` (don't bump the shared constant); verify
  waiting-room/player-panel layouts at 6 seats.
- **Secrecy expectation:** hands are UI-hidden, not cryptographically secret (devtools can read them);
  acceptable per the chosen model — note it in the UNO menu/README so it isn't mistaken for cheat-proof.
