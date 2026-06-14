# Plan: Add "Bank El-Hazz" game at `/bank`

> **This plan document will itself be saved into the repo at `_plans/bank-el-hazz.md`** as the
> first execution step (joining the existing `_plans/uno.md` and `_plans/ludo.md`).

**Progress:** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅ · Phase 5 ✅ · Phase 6 ✅ · Phase 7 ✅ · Phase 8 ✅

> **All 8 phases complete.** Phases 5–8 (this pass): **P5** — `src/bank/bot.ts`
> (deterministic buy/skip heuristics by difficulty) + `bot.test.ts`,
> `src/hooks/useBankBotAutoPlay.ts` (rolls + resolves the buy pause), and a
> human/computer + difficulty picker in `BankSetupScreen`. **P6** — `ADD_PLAYER`
> in the reducer, `useBankElHazz` rounded out to the `OnlineMatchGame` contract
> (`finishedOrder`/`lastRoll`/`applyRemoteDecision`/`addPlayer`),
> `components/bank/online/{BankOnlineGame,BankOnlineRoom}.tsx` over the unchanged
> `useOnlineMatch`/`roster.ts`, `BankGameScreen` made online-aware (RoomBadge,
> turn gating, leave), and `BankApp` gaining a lazy 3rd mode + `?room` deep link.
> **P7** — doubles / Fast Bus celebration banner, a fixed-LTR board coordinate
> space for RTL safety, bot/"you"/"away" panel chips. **P8** — `src/bank/save.ts`
> (resume an in-progress local match) + `history.ts` (finished-match log), wired
> into `BankLocalGame` (persist/resume prompt) and a `BankHistoryModal` on the
> menu, with `save.test.ts` + `history.test.ts`. Buy/jail decisions and luck/court
> cards were already baked into the resolution, so online needed no logic changes.
> Trading stays local-only (no cross-client offer/accept handshake exists).

## Context

"Robin's Games" (`src/Root.tsx` router → `/` hub, `/snakes`, `/ludo`, `/four`, `/uno`) is a
multi-game hub. Every game is built in the same deliberately layered architecture: **pure
deterministic logic** (`src/<game>/`) → a single **orchestration hook** (`src/hooks/use<Game>.ts`) →
**transport-agnostic networking** (`src/net/`) → **thin React components** (`src/components/<game>/`).
We are adding **Bank El-Hazz** — a simplified, Egyptian-flavoured Monopoly — as a new game on its own
route `/bank`, built to the same standard and lazy-loaded so the hub and other routes never pay for
its chunk.

The work is split into the **8 phases from the spec**. **Phase 1 (local playable MVP) is built first
and is detailed file-by-file below.** Phases 2–8 are scoped to show how they slot cleanly into the
architecture (do **not** build them yet). The whole point of the Phase-1 design is that later phases
are *additive*: a new tile type, a new rule toggle, or online sync each drop in without restructuring
the commit/animate/replay pipeline.

### Bank El-Hazz vs. the existing games — the one new wrinkle

Snakes/Four/UNO/Ludo compute a turn's **entire** outcome from one action and replay it. Bank
El-Hazz adds two things the others don't have together:

1. **An interactive mid-turn decision** — landing on an unowned, affordable property opens a *buy/skip*
   choice. This is modelled exactly like Ludo's local `selecting` pause and the existing
   continue/end `MatchDecision`: a separate, **seq-stamped** committed event behind a local
   `deciding` phase, so it stays replay-safe online with no authoritative server.
2. **Cascading effects** — a luck card can move you, and the new tile then has its own effect (a
   chain). We model a turn's outcome as an **ordered list of `TurnEffect`s** computed once on the
   acting client; the reducer applies them in order and the hook animates them in order. New tile
   types / rules become new effect kinds.

### Confirmed scope decisions (from the user)

1. **40-tile board** on an **11×11 grid** — the 40 perimeter cells are the tiles; the 9×9 interior is
   free for dice + branding + log. Corners land cleanly at indices **0 / 10 / 20 / 30**
   (Start / Jail / Free-Parking / Go-To-Jail) — the classic Monopoly layout.
2. **English + Arabic from Phase 1.** The repo's `src/locales/parity.test.ts` fails CI if a namespace
   exists in one language but not the other, so both `en/bank.json` and `ar/bank.json` ship in
   Phase 1 (matching every other game). Phase 7 only *polishes* the Egyptian theme + RTL board feel.
3. **This is the full-roadmap doc.** Phase 1 is executable in depth; Phases 2–8 are scoped.

### Phase 1 board revision — match the physical "بنك الحظا" board

After Phase 1 shipped, the board was redesigned to match a real Egyptian *Bank
El-Hazz* board (photo provided by the user). The mechanics/architecture are
unchanged; only the **board data + two card decks + currency + center art** moved:

1. **Orientation.** **Start (البداية) sits bottom-left** with the red up-arrow;
   play runs **clockwise** (up the left edge, across the top, down the right,
   along the bottom back to Start). `buildPerimeter()` now walks from bottom-left.
   Corners stay at indices 0/10/20/30 = **Start / Go-To-Jail / Free-Parking (استراحة) / Jail (السجن)**.
2. **Two card decks, drawn from the board center.** The board has **two** card
   tiles, not one: **حظك (Luck**, dice 🎲) and **محاكمة (Court**, scales ⚖️). A new
   `court` `TileKind` joins `luck`; each draws from its own deck (`LUCK_DECK` /
   `COURT_DECK`). The drawn card id + deck are baked into a `card` `TurnEffect`
   (`{ kind:'card'; deck:'luck'|'court'; cardId }`) so replays stay deterministic.
   The center hub renders the **bank building + both draw piles**; landing on
   luck/court reveals a card "off the top of the board".
3. **Egyptian pound currency.** All money shows in **جنيه / E£** (a `money` i18n
   key), never USD `$`.
4. **Cities + colors.** Tiles are Arab/Egyptian cities in eight color groups
   matched to the photo (red, cyan, pink, orange, gold, maroon, green) plus a
   utilities group (Suez Canal, Banque Misr, petrol station, Cairo hospital).
   The exact `BOARD` array in `bank/config.ts` is the single source of truth —
   a best-effort transcription of the photo, easy to correct in one place.

`reward` tiles were dropped from the layout (money now comes from cards, rent,
and pass-start); the `reward` effect/kind remain in the contract, unused.

**Custom corner tiles (user request).** Two corners differ from classic Monopoly:

- **The Lucky Club (نادي الحظ)** replaces Go-To-Jail at tile 10: landing on it
  charges a flat **30 LE** fee (`luckyClub` tile kind; a `cash` effect with
  `reason:'club'`). There is no Go-To-Jail tile — jail is reached only via a
  Luck/Court card.
- **The Fast Bus (الأتوبيس السريع)** replaces Free-Parking/Rest at tile 20:
  landing on it sets a one-shot buff so the player's **next roll's total is
  doubled** (4 → 8, etc.). Modelled as a `fastbus` tile kind emitting a
  `fastBus` effect → `BankPlayer.fastBus` flag; `resolveTurn` doubles the dice
  total when the flag is set and reports `usedFastBus`, and the reducer consumes
  the flag on that roll. Replay-safe (the doubled move is baked into the
  resolution).

**Currency sign** is **LE** (e.g. `1500 LE`) in English; Arabic stays `جنيه`.

### Governing constraint

**Do not change Snakes / Ludo / Four / UNO behaviour.** All shared-infra edits are additive and
generic: one new `GameId`, one new lazy route, one hub card, a new locale namespace, and a few new
**additive** `soundEngine` methods. No edits to `src/net/`, `turnSequencer.ts`, `matchLog.ts`,
`WinnerOverlay`, `Backdrop`, or `Dice3D` — all reused as-is.

---

# PHASE 1 — Local playable MVP (the focus)

**Goal:** a fully playable, stable, **same-device hot-seat** game for **2–4 players**: setup → roll →
move → buy/rent/luck/tax/reward/jail → bankruptcy → last-player-standing winner, with a visible game
log, responsive on desktop + mobile. **No online, no AI, no trading/mortgage/upgrades/auctions** (but
the code is structured so those slot in).

Build in dependency order. Each step is independently verifiable.

## Step 1 — Register Bank El-Hazz on the hub (route, card, SEO, i18n, stats)

Get an empty `/bank` route on screen and wired before any game logic.

1. **Save this plan** to `_plans/bank-el-hazz.md`.
2. **`src/Root.tsx`** — add `const BankApp = lazy(() => import('./components/bank/BankApp').then((m) =>
   ({ default: m.BankApp })))` and a `/bank` `<Route>` inside `<Suspense fallback={<RouteFallback/>}>`,
   mirroring `/uno`. The `*` → `/` catch-all already covers it.
3. **`src/components/HomeHub.tsx`** — add one entry to the `games` array (the `Game` shape on line 14):
   `{ id:'bank', title:t('bank:title'), tagline:t('bank:tagline'), emoji:'🏦', to:'/bank',
   accent:'from-amber-500/30 via-transparent to-emerald-400/25' }`, and add `'bank'` to the
   `useTranslation([...])` namespace array on line 45.
4. **i18n** — create `src/locales/en/bank.json` + `src/locales/ar/bank.json` (start with
   `title`, `tagline`, `metaTitle`, `metaDescription`, then grow per component). Register both in
   `src/i18n.ts` (the `resources` object on lines 30–31 **and** the `ns` array on line 34), and add the
   `bank` namespace to the type map in `src/i18next-types.ts`. `parity.test.ts` then enforces EN/AR
   parity automatically.
5. **Stats** — extend the `GameId` union in `src/lib/stats.ts:10` to `... | 'bank'` (per-game counters
   accumulate, no migration).
6. **SEO** — `BankApp` (placeholder for now) calls `useDocumentMeta({ title: t('bank:metaTitle'),
   description: t('bank:metaDescription') })` (`src/lib/useDocumentMeta.ts`) and renders inside
   `<Backdrop>` with a `LanguageSwitcher` + a back-to-hub `<Link to="/">`.

**Verify Step 1:** `npm run build` green; `/` shows the Bank card; `/bank` loads its own lazy chunk;
document title/canonical change on the route; `npm test` (parity) green.

## Step 2 — Pure logic layer `src/bank/` (deterministic, vitest-tested)

Framework-free core — no React, DOM, timers, or randomness leak. See the **design reference** below
for exact contracts. Build and test in this order:

- **`config.ts`** — single source of truth for tunables: `BANK_GRID=11`, `BOARD_TILES=40`,
  `START_CASH=1500`, `PASS_START_REWARD=200`, `JAIL_FINE=50` (reserved for P2), `MAX_LUCK_CHAIN=2`,
  the hand-authored **`BOARD: BankTile[]`** (40 tiles — see layout in the reference), `PROPERTY_GROUPS`,
  `LUCK_DECK: LuckCard[]`, `BANK_COLORS` (token palette), `DEFAULT_BANK_PLAYERS`, `DEFAULT_BANK_RULES`
  + an `asBankRules()` validator (defaults-only in P1; the seam for P2 settings), and `TIMING` (all
  animation ms — dice, step, cash-beat, luck-reveal, jail, bankrupt, handoff).
- **`types.ts`** — `BankTile`, `TileKind` (`'start'|'property'|'luck'|'tax'|'reward'|'jail'|'gotojail'
  |'parking'`), `LuckCard`/`LuckEffect`, `BankPlayer`, `Ownership` (`{ owner; level; mortgaged }` —
  full shape from day one so P3/P4 are no-churn), `BankGameState`, `BankPhase`, `BankRules`,
  **`TurnEffect`** (the ordered sub-event union), **`BankTurnResolution`** (the discriminated-union
  wire contract: `type: 'roll' | 'decision' | 'jailSkip'`), and `BankSeatState` (reserved for P6).
- **`board.ts`** + **`board.test.ts`** — `buildPerimeter()` (generates the 40 `[row,col]` coords by
  walking the ring), `tileCoords`/`tilePercent`, `cellsInRenderOrder()` (121 cells), `forwardSteps`,
  `landingTile`, `passesStart`, `tileRole`. Test asserts: 40 unique in-bounds coords, perimeter
  adjacency (chebyshev === 1 incl. the 39→0 wrap), corners at 0/10/20/30, corner kinds, wrap math,
  `passesStart` truth table, every property `group` valid + each group ≥ 2 tiles.
- **`rules.ts`** + **`rules.test.ts`** — `rollDice(rng)`, **`resolveTurn(ctx): BankTurnResolution`**
  (movement + the full bounded effect chain incl. luck recursion, pass-start accounting, rent/tax/
  reward, jail, bankruptcy, win), `resolveBuyDecision`/`resolveDecline`, `buildJailSkip`, and pure
  helpers `rentFor`, `netWorth`, `canAfford`, `drawLuck(rng)`. Injectable `rng` → deterministic tests.
- **`bankReducer.ts`** + **`bankReducer.test.ts`** — `initialBankState`, `bankReducer`. Pure phase
  machine that only *applies* an already-computed resolution (computes no rules, runs no async). The
  headline test is the **deterministic-replay property**: a scripted resolution list applied twice
  from a fresh `START_GAME` yields byte-identical state — the property the whole online layer rests on.
- **`recap.ts`** + **`recap.test.ts`** — `summarizeBank(log)` (properties bought, rent paid/collected,
  taxes, rewards, luck draws, jail visits, bankruptcies, final cash) for the winner-overlay stats panel.

**Verify Step 2:** `npm test` green (all new Bank tests + existing tests).

## Step 3 — Sound + orchestration hook

- **`src/audio/soundEngine.ts`** — **additively** add synthesized (no asset files) methods:
  `playCoins()` (cash gain/rent/reward), `playPassStart()` (two-note rising chime), `playLuckDraw()`
  (mystical shimmer), `playBuy()` (cha-ching/stamp), `playJail()` (gate clang), `playBankrupt()`
  (descending sad glissando). Reuse existing `playRoll`/`playStep`/`playSkip`/`playWin`/`playPenalty`.
  Existing methods untouched.
- **`src/hooks/useBankElHazz.ts`** — the orchestration facade (mirror `useLudo.ts`): `useReducer` +
  refs + the shared `createTurnSequencer` (`src/lib/turnSequencer.ts`) for the turn-lock/run-token,
  `useReducedMotion` timing, `controlsPlayer` gate (`'all'` for hot-seat), `matchLog` append per
  commit, and a local **undo** history stack (pass-and-play, like Ludo). New game-specific beats:
  the async **`executeTurn(resolution, alive)`** (dice tumble → walk tile-by-tile with pass-start
  flash → land → ordered effect animation → commit), and the post-move **`deciding`** pause resolved
  by `decideBuy()` / `decideDecline()` (each produces a `type:'decision'` resolution committed through
  the same channel). Returns the `BankController` object. The **bot driver is deferred to Phase 5** —
  carry `isBot` on players but never set it in P1.

**Verify Step 3:** `npm run build` (types) green.

## Step 4 — UI components + local play end-to-end

New `src/components/bank/` (animations use `m.*` under the existing `LazyMotion` provider — never
`motion.*`, which throws in strict mode):

```
BankApp.tsx            2-mode shell (menu | local); online seam reserved (3rd mode added in P6).
                       Consumes ?room=CODE once on mount; useDocumentMeta; back-to-hub link.
BankMainMenu.tsx       Local Play (online button hidden/disabled in P1) + LanguageSwitcher.
BankLocalGame.tsx      Local orchestrator (mirrors UnoLocalGame): owns the controller, swaps screens.
BankSetupScreen.tsx    2–4 players: name + token color (dedup), Start button. Cash fixed at 1500 in P1.
BankGameScreen.tsx     Board + player panels + controls + log.
BankControls.tsx       Roll button (keyboard-accessible), mute, undo, new game.
board/BankBoard.tsx    11×11 CSS grid surface (memoized) + un-clipped absolute token layer.
board/BankTile.tsx     One perimeter cell, themed by kind; owner ribbon in the owner's color.
board/BankCenter.tsx   Center hub: branding + Dice3D (reused) + turn indicator.
board/BankToken.tsx    One pawn, m.* positioned by tilePercent; co-located pawns fanned (Ludo pattern).
BankBuyModal.tsx       Buy/skip prompt (AnimatePresence; shown when phase === 'deciding' & my turn).
BankLuckCardModal.tsx  Drawn-card reveal (AnimatePresence; transient luckReveal during executeTurn).
BankPlayerPanel.tsx    Per-player cash, #properties, jailed/bankrupt chips, current-turn highlight.
BankGameLog.tsx        Scrolling action feed rendered from matchLog (the spec's "visible history").
```

Reuse verbatim: `WinnerOverlay` (+ `RecapPanel` fed by `recap.ts`), `Backdrop`, `BackToHubLink`,
`Dice3D`, `LanguageSwitcher`, `useRecordMatch` (record the finished match once → `recordMatch('bank',
…)`), `useUnloadGuard`. Replace the Step-1 `BankApp` placeholder with the real shell.

**Verify Phase 1 (acceptance criteria):** `npm run dev` → a local 2–4-player match exercises **every**
spec criterion: enter 2–4 names → start → each player has 1500 → correct turn order → dice moves the
pawn → passing Start pays 200 → unowned property offers a buy → owned property charges rent → luck
cards apply (incl. a move-chain and go-to-jail) → tax debits / reward credits → Go-To-Jail jails
without paying Start → a jailed player skips exactly one turn → a player who can't pay goes bankrupt
and frees their properties → last solvent player wins (WinnerOverlay) → the game log shows every
action. Responsive on desktop + mobile. `npm test` + `npm run lint` + `npm run build` all green.

---

# PHASE 2 — Better rules (additive)

All additive to the Phase-1 contracts (no restructuring):

- **Doubles** → extra turn (reserve `consecutiveDoubles` on state, mirroring Ludo's `consecutiveSixes`
  baked in the resolution); **3 doubles in a row** → jail.
- **Full-group ownership** → **double rent** — computable from `ownership` + `PROPERTY_GROUPS` with no
  schema change (groups already each have ≥2 tiles, enforced by `board.test.ts`).
- **Richer jail** — pay `JAIL_FINE` (50) / use a Get-Out-Of-Jail-Free card / roll doubles to escape /
  forced pay after 3 fails. The GOOJF card joins `LUCK_DECK` and becomes a kept card on `BankPlayer`.
- **Game settings** (host-chosen) — starting cash, start reward, max rounds (enables Timed/Round win
  mode), toggle doubles. These fill out `BankRules` + `asBankRules()` (already present), exactly like
  UNO's `UnoRules` toggles, and ride in the `start` payload for P6.

# PHASE 3 — Property upgrades (additive)

House/hotel system (levels 0–4) — set `Ownership.level` (already in the shape). Upgrade cost +
`rentByLevel[]` on each `BankTile`; upgrade only when the full group is owned; sell upgrades; visual
building indicator on `BankTile`; a property-details modal. New `TurnEffect` kind `upgrade` — animate
+ replay through the unchanged pipeline.

# PHASE 4 — Trading & mortgage (additive)

Mortgage (`Ownership.mortgaged`, already in the shape): mortgage = 50% of price, unmortgage = +10%,
mortgaged collects no rent (`rentFor` already reads the ownership entry). Trading (property/money,
both-accept) as a new decision-style resolution + UI; both ride the existing seq-stamped event channel.

# PHASE 5 — AI players

New `src/hooks/useBankBotAutoPlay.ts` (mirrors `useLudoBotAutoPlay`) driving `roll` + `decideBuy`.
Heuristics by difficulty (easy/medium/hard): buy/decline by cash floor, complete groups, pay rent;
deterministic given state. `isBot`/`botLevel` already carried on players from P1.

# PHASE 6 — Online multiplayer

`src/components/bank/online/BankOnlineGame.tsx` + `BankOnlineRoom.tsx` mirror `LudoOnlineGame`/
`LudoOnlineRoom`. Wire `useBankElHazz` to `useRoom<BankTurnResolution, BankSeatState>({ channelPrefix:
'bank-room', maxPlayers, … })`, reusing the entire self-healing sync (ping/request/state, host
divergence tie-break, host migration, late-joiner approval, presence skips/forfeits, reactions) and
`roster.ts` **unchanged**. Because luck cards are already baked into the resolution and the buy/jail
decisions are already seq-stamped committed events, online replay needs **no logic change** — only
the seat-state adapter + `BankApp` gaining its 3rd mode. (If a future variant wants a reproducible
luck-deck order, carry a `cardSeed` in the `start` payload exactly like UNO's `deckSeed`.)

# PHASE 7 — UI polish & Egyptian theme

Egyptian board art + fun property names (the `BOARD` strings are already themed), richer dice/token/
luck-card/coin animations, the new `soundEngine` beats tuned, full mobile layout pass, and the
**RTL/Arabic polish** (board geometry is direction-neutral; chrome uses Tailwind logical utilities
`ms-*`/`me-*`/`start-*`/`end-*`). The EN/AR namespace already exists from Phase 1.

# PHASE 8 — Save game & history

Persist an in-progress match (reuse `src/lib/storage.ts`) + resume; match history + player statistics
(properties bought, rent collected, etc.) extending `recap.ts` + `src/lib/stats.ts`.

---

# Bank El-Hazz design reference (details for Phase 1)

## Board geometry (11×11, 40 perimeter tiles)

An 11×11 grid has a perimeter of `4·11 − 4 = 40` cells — exactly the tile count, so each tile is one
perimeter cell and the 9×9 interior is free. Unlike Ludo's 15×15 ring, a square perimeter is strictly
**edge-adjacent** the whole way around (no diagonal "king step"), so the adjacency test is the strict
chebyshev === 1.

`buildPerimeter()` walks the ring starting **bottom-right** so Start sits bottom-right and play moves
left along the bottom then up — the familiar Monopoly orientation (`[row,col]`, row 0 = top):

| Index | Cell `[row,col]` | Role |
|---|---|---|
| 0 | `[10,10]` | **Start** (corner) |
| 1–9 | `[10,9] … [10,1]` | bottom edge (walking left) |
| 10 | `[10,0]` | **Jail / just visiting** (corner) |
| 11–19 | `[9,0] … [1,0]` | left edge (walking up) |
| 20 | `[0,0]` | **Free Parking / Rest** (corner) |
| 21–29 | `[0,1] … [0,9]` | top edge (walking right) |
| 30 | `[0,10]` | **Go-To-Jail** (corner) |
| 31–39 | `[1,10] … [9,10]` | right edge (walking down) → wraps to 0 |

Generate the coords in code, then assert them against a hand-authored fixture in `board.test.ts` so the
test is an independent oracle.

### Illustrative tile layout (config detail; the test asserts only the invariants)

Corners fixed at 0/10/20/30. 23 properties in 8 color-groups (sizes 3·7 + 2·1), 5 luck, 3 tax, 5
reward. Egyptian names (placeholders — tune in Phase 7):

```
0  Start (البداية)        10 Jail/Just-Visiting     20 Free Parking (استراحة)   30 Go-To-Jail
1  Aswan      [A]          11 Saqqara     [C]         21 Alexandria  [E]          31 Giza Pyramids [G]
2  Luck                    12 Luck                    22 Luck                     32 Luck
3  Luxor      [A]          13 Memphis     [C]         23 Rosetta     [E]          33 Sphinx        [G]
4  Income Tax (−100)       14 Dahshur     [C]         24 Damietta    [E]          34 Khan El-Khalili [G]
5  Esna       [A]          15 Siwa        [D]         25 Port Said   [F]          35 Reward (كنز +50)
6  Hurghada   [B]          16 Sales Tax (−75)         26 Reward (كنز +100)        36 Cairo Tower   [H]
7  Reward (كنز +100)       17 Bahariya    [D]         27 Ismailia    [F]          37 Luck
8  Sharm      [B]          18 Reward (كنز +150)       28 Suez        [F]          38 Nile Corniche [H]
9  Dahab      [B]          19 White Desert[D]         29 Wealth Tax (−150)        39 Reward (هدية +200)
```

Per-property `price`/`rent` live on each `BankTile` (with room for `rentByLevel[]`/`houseCost` in P3).

### `board.ts` helpers

`tileCoords(id)`, `tilePercent(id)` (`{x:(col+0.5)·100/11, y:(row+0.5)·100/11}`), `cellsInRenderOrder()`,
`forwardSteps(from, n)` (`[(from+1)%40 … (from+n)%40]` — the per-cell walk path), `landingTile(from,n)`,
`passesStart(from,n)` (`from+n ≥ 40`), `tileRole(id)`.

## State model & wire contract

```ts
interface BankGameState {
  players: BankPlayer[]                     // {id,name,color,position,cash,status,jailTurns,isBot?}
  ownership: Record<number, Ownership>      // keyed by TILE id → {owner,level,mortgaged}
  currentPlayerIndex: number
  phase: BankPhase                          // 'setup'|'idle'|'rolling'|'moving'|'deciding'|'won'
  rules: BankRules
  lastDice: DieValue[]
  pendingBuy: { seat: number; tile: number; price: number } | null
  bankruptedOrder: number[]                 // elimination order → standings
  winnerId: number | null
  winReason: 'lastStanding' | 'forfeit' | null
  turnCount: number                         // the online sequence counter
}
```

`ownership` is a **map keyed by tileId with the full `{owner,level,mortgaged}` shape from day one** — in
P1 `level` is always 0 and `mortgaged` false, but P3 (upgrades) and P4 (mortgage) add **zero**
structural churn. `rentFor(tile, ownership)` reads the whole entry.

**`TurnEffect`** — the ordered, fully-deterministic outcome list (the reducer applies in order; the
hook animates in order; replays identically online):

```ts
type TurnEffect =
  | { kind:'move'; from:number; to:number; path:number[]; passedStart:boolean }
  | { kind:'passStart'; amount:number }                              // +200, explicit so it can flash/log
  | { kind:'cash'; seat:number; delta:number; reason:'tax'|'reward'|'luck'|'maintenance' }
  | { kind:'pay'; from:number; to:number; amount:number; reason:'rent'|'luck-pay-each' }
  | { kind:'collect'; to:number; froms:number[]; amount:number; reason:'luck-collect-each' }
  | { kind:'luck'; cardId:string }                                   // drawn card baked in (no re-draw)
  | { kind:'jail'; seat:number }                                     // → tile 10, jailed, no pass-start
  | { kind:'bankrupt'; seat:number; releasedTiles:number[] }         // freed properties baked in
```

**`BankTurnResolution`** — one discriminated union so a single `COMMIT_TURN` channel + `matchLog` +
`recap` handle every case uniformly (no edits to `matchLog.ts`):

```ts
type BankTurnResolution =
  | { type:'roll';     seat:number; dice:[DieValue,DieValue]; effects:TurnEffect[];
                       finalTile:number; buyOption:{tile:number;price:number}|null;
                       isWin:boolean; winnerId:number|null }
  | { type:'decision'; seat:number; tile:number; action:'buy'|'decline'; price:number }
  | { type:'jailSkip'; seat:number }                                  // committed skip; decrements jailTurns
```

### Pass-start accounting

Computed **per movement effect** in `rules.ts` and emitted as an explicit `passStart{amount}` effect
the reducer applies verbatim: a forward roll crossing index 0 pays; a luck `+3` crossing 0 pays;
"go to Start" carries its own `+200`; **go-to-jail never pays**; backward luck (`−2`) never pays.
Truth-table tested. The reducer never recomputes it.

### Luck-card chains (bounded)

`resolveTurn` builds the effect list with a **bounded iterative loop** (`MAX_LUCK_CHAIN=2`), never
unbounded recursion: land on luck → `drawLuck(rng)` (card id baked into a `luck` effect + its concrete
effects). If the card moves you, emit a new `move`/`jail`, recompute the landing, and resolve *its*
action — up to the cap; at the cap, land without resolving the final tile's action (prevents
"+3 luck → +3 luck → …"). Go-to-jail and go-to-Start terminate the chain immediately. A property
reached *via* luck still opens `buyOption` (computed from `finalTile` after the whole chain).

### Replay-safe randomness

P1 is local-only: `drawLuck(rng)` runs once on the acting client and the **drawn card id is baked into
the resolution** — exactly like UNO bakes the played card and Ludo bakes the `tokenId`. The reducer
never draws, so the same resolution replays identically (and is P6-ready with no shape change).

## Reducer — phases & actions

Phases: `setup → idle → rolling → moving → deciding → idle (loop) … → won`. Jail-skip and bankruptcy
are handled *inside* the commits + the next-active helper, not as separate phases.

| Action | Effect |
|---|---|
| `START_GAME{players,rules?}` | Build players (cash=1500, pos=0, active), empty ownership, phase `idle`; shuffle lineup for a random first player (like Ludo). |
| `BEGIN_ROLL{dice}` / `BEGIN_MOVE` / `BEGIN_DECIDE` | Transient phase transitions (`rolling`/`moving`/`deciding`). |
| `COMMIT_TURN{resolution}` | Apply per `resolution.type`. **`roll`**: apply every `TurnEffect` in order (move, cash, pay/collect, jail, bankrupt+release); `turnCount+1`; then if `isWin`→`won`; else if `buyOption` & seat solvent→phase `deciding`, set `pendingBuy`, **keep currentPlayerIndex**; else advance to next active, phase `idle`. **`decision`**: apply buy (deduct price, set `ownership[tile]`) or decline (no-op); `turnCount+1`; clear `pendingBuy`; advance; phase `idle`. **`jailSkip`**: decrement `jailTurns` (→active at 0); `turnCount+1`; advance; phase `idle`. |
| `SKIP_TURN` | (P6) absent online player; advance; `turnCount+1`. |
| `FORFEIT_WIN{winnerId}` | (P6) last player standing; phase `won`. |
| `RESTORE{state}` / `RESET` | Local undo / new game. |
| `LOAD_SNAPSHOT{…}` | Thin now (P6 parity). |

`turnCount` increments on **every** committed event (roll/decision/jailSkip/skip) — one online
sequence step each. `nextActiveIndex` skips `status!=='active'` (bankrupt) seats. Win =
exactly one active player remains after a commit (`winReason:'lastStanding'`); a forced payment that
can't be met in full → `bankrupt` (no partial payment / liquidation in P1).

## `useBankElHazz` — `executeTurn(resolution, alive)`

`BEGIN_ROLL` → tumble dice (`playRoll`) → **if `jailSkip`**: short beat (`playSkip`) → `COMMIT_TURN` →
return. Else `BEGIN_MOVE` → walk the `move` effect's `path` cell-by-cell (`playStep`; brighter +
pass-start flash on the cell that crosses 0) → play remaining effects in order (`passStart`→
`playPassStart`; `luck`→`playLuckDraw` + reveal modal; `cash`/`pay`/`collect`→`playCoins`/`playPenalty`
+ delta flash; `jail`→`playJail`; `bankrupt`→`playBankrupt`) → handoff beat → clear the transient
mover → `COMMIT_TURN` + `matchLog` append → `playWin` if `isWin`. `alive()` checked after every
`await` (run-token cancellation). When the reducer lands in `deciding`, the driver waits; `BankBuyModal`
shows for the controllable seat; `decideBuy`/`decideDecline` produce a `type:'decision'` resolution
committed through the same channel. `syncStatus().busy` includes `phase==='deciding'`.

**Controller shape:** `…state, currentPlayer, winner, standings, activeMove, pendingBuy, luckReveal,
matchLog, muted/toggleMute, controlsPlayer, isMyTurn, canRoll, canUndo, roll, decideBuy,
decideDecline, undo, startGame, reset` (+ thin P6 stubs `applyRemoteTurn/applySkip/loadSnapshot/
forfeitWin/syncStatus`).

## Tests (node env, pure logic only)

- **board.test.ts** — geometry invariants (above): 40 unique in-bounds coords, perimeter adjacency incl.
  wrap, corners + kinds, wrap math, `passesStart` truth table, group membership ≥2, tile-kind totals.
- **rules.test.ts** — correct `finalTile` + single pass-start; buy-option set only when unowned &
  affordable (no ownership effect — purchase deferred); rent = `rentFor`; own/owned/unowned branches;
  signed tax/reward; each of the luck cards' effects (incl. `+3→tax` chain order `[luck,move,cash]`,
  go-to-jail forces `buyOption=null` + no pass-start, go-to-Start pays, pay/collect-each only from
  solvent players, `−40·owned` maintenance); chain depth cap (no infinite loop); bankruptcy emits
  `bankrupt{releasedTiles}` and "must pay in full or go bankrupt"; win when 2nd-to-last is bankrupted.
- **bankReducer.test.ts** — **deterministic-replay property** (a scripted resolution list applied twice
  → byte-identical state); `START_GAME` init; `COMMIT_TURN` per type (effects applied, `turnCount`
  bumps, `deciding` keeps the seat, decision/jailSkip advance); bankruptcy frees tiles + `nextActiveIndex`
  skips; win → phase `won`; jailed player skips exactly one (committed) turn.
- **recap.test.ts** — `summarizeBank` totals over a scripted `matchLog`.

## Risks & mitigations

1. **Interactive decision vs. replay model (highest).** Modelled as a *separate* seq-stamped committed
   event behind a local `deciding` pause (Ludo `selecting` + continue/end `MatchDecision` pattern);
   nothing about the choice is baked into the roll resolution; the resolution is a discriminated union
   so one `COMMIT_TURN` channel + `matchLog` + `recap` stay uniform (no `matchLog.ts`/net edits).
2. **Luck-card chains / infinite recursion.** Bounded iterative loop (`MAX_LUCK_CHAIN=2`); jail/Start
   terminate immediately; every effect baked into an ordered list; chain orderings unit-tested.
3. **Perimeter geometry correctness.** Generate coords + assert against a hand-authored oracle;
   chebyshev===1 around the whole ring incl. wrap; corners at 0/10/20/30.
4. **Pass-start double-counting.** Computed per movement effect, emitted explicitly, applied verbatim;
   go-to-jail/backward never pay; truth-table tested.
5. **Bankruptcy / property release.** `releasedTiles` baked into the effect (reducer applies, doesn't
   decide); `nextActiveIndex` skips non-active; win re-checked after every commit.
6. **Future-phase churn.** Avoided up front: `ownership` map with `{owner,level,mortgaged}`; per-tile
   `price`/`rent` (+room for `rentByLevel`); `BankRules`+`asBankRules()` present; groups ≥2; ordered
   effect list extensible by new `kind`s; thin net stubs + `BankSeatState` reserved for P6.
7. **i18n parity.** Author `en/bank.json` + `ar/bank.json` together with identical key trees from the
   first commit; register in `i18n.ts` + `i18next-types.ts` + the `useTranslation([...])` arrays.

## Verification (end-to-end)

- `npm test` — all Bank `*.test.ts` + existing tests + EN/AR parity green.
- `npm run build` — `tsc -b && vite build`; confirm Bank is a **separate lazy chunk** (the `/` + other
  routes' initial bundles exclude it).
- `npm run lint`.
- `npm run dev` — full manual pass against the Phase-1 acceptance criteria (every item in "Verify
  Phase 1" above); confirm Snakes/Ludo/Four/UNO are unchanged and deep-linking `/bank` works under the
  Netlify SPA redirect.
