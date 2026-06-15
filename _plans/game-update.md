# Bank El-Hazz — match the physical board & add card-confirmation popups

## Context

The Bank El-Hazz (بنك الحظ) game already exists and works, but it diverges from the
real physical board the user owns (photo provided). The work:

1. **The board is the wrong shape and has the wrong cells.** The real board has **34
   tiles on an 11×8 rectangle** (the current code assumes a 40-tile 11×11 square), with a
   different, user-supplied set of cities and card cells, and **no Income/Sales Tax**.
2. **Full visual remake** of the board to look like the vintage photo, plus three
   readability fixes the user called out (dice spacing, bigger tiles/font, owner **name**
   shown on owned properties).
3. **Luck/Court cards must open a popup the player dismisses with a button**, and when a
   card adds/deducts money the popup must show the **calculation** (e.g. "You have
   1200 LE − 200 LE → 1000 LE"). Every draw, including bots', waits for a human click.

The game is **local pass-and-play only** (online "coming soon"), so the blocking popup
needs no network-sync handling.

---

## Part 1 — Rebuild the board: 11×8 / 34 tiles, real cells

### 1a. Geometry change (34 tiles on an 11-wide × 8-tall grid)
The board is **34 cells**, not 40, and is a **landscape rectangle**: 2·(11 cols) + 2·(8
rows) − 4 corners = **34**. Corners (0-indexed) sit at **0 (Start, bottom-left), 7 (Lucky
Club, top-left), 17 (Fast Bus, top-right), 24 (Jail, bottom-right)**. Today the code
hard-codes a single square dimension; this must become two dimensions.

- **`src/bank/config.ts`**: replace `BANK_GRID = 11` with **`BANK_COLS = 11`** and
  **`BANK_ROWS = 8`**; set **`BOARD_TILES = 34`**.
- **`src/bank/board.ts`**: rewrite `buildPerimeter` for a rectangle (left edge bottom→top
  = 8 cells, top edge left→right = 11, right edge top→bottom = 8, bottom edge right→left =
  11; corners fall at 0/7/17/24 automatically). Update `tilePercent` to divide **x by
  `BANK_COLS`, y by `BANK_ROWS`**, and `cellsInRenderOrder` to iterate `BANK_ROWS` ×
  `BANK_COLS` (88 cells, 34 perimeter + 54 interior). `forwardSteps`/`landingTile`/
  `passesStart` use `BOARD_TILES` and need no shape logic.
- **`src/components/bank/board/BankBoard.tsx`**: `gridTemplateColumns: repeat(BANK_COLS,
  1fr)`, `gridTemplateRows: repeat(BANK_ROWS, 1fr)`, and change the board container from
  `aspect-square` to **`aspect-[11/8]`**.
- **`src/components/bank/board/BankCenter.tsx`**: the hub inset is currently
  `inset-[9.0909%]` (1/11 all sides). For a rectangle use **`inset-x` ≈ 9.09% (100/11)**
  and **`inset-y` = 12.5% (100/8)** so it covers the 9×6 interior exactly.
- **`src/bank/board.test.ts`**: rewrite the ORACLE + corner-coord + count assertions for
  11×8 / 34 (corners at 0/7/17/24; `tileCoords(0)=[7,0]`, `(7)=[0,0]`, `(17)=[0,10]`,
  `(24)=[7,10]`).

### 1b. The board (final — your complete list with prices, 0-indexed)
All cell names and property prices are set. The one remaining ⚠︎ is tile 3's card deck.

```
  CORNERS:  0 Start · 7 Lucky Club · 17 Fast Bus · 24 Jail

  LEFT EDGE (0–7, bottom → top)
 0  Start — البداية (corner)
 1  القدس (Jerusalem)        property    90
 2  غزه (Gaza)               property   250
 3  ⚠︎ Card cell — "Lucky or Court". Confirm deck: حظك (Luck) or محاكمة (Court)?
 4  بيروت (Beirut)           property   300
 5  الرياض (Riyadh)          property   250
 6  بغداد (Baghdad)          property   250
 7  Lucky Club — نادي الحظ (corner, building/club icon)

  TOP EDGE (8–16, left → right)   [7 Lucky Club … 17 Fast Bus]
 8  بني غازي (Benghazi)      property   150
 9  عدن (Aden)               property   100
10  محاكمة (Court)           card
11  البحرين (Bahrain)        property   300
12  حظك (Luck)               card
13  الدار البيضاء (Casablanca)  property   250
14  تونس (Tunis)             property   200
15  البنزينة (Petrol/Gas)     utility    300
16  الجزائر (Algiers)        property   300

17  Fast Bus — الأتوبيس السريع (corner; doubles your next roll)

  RIGHT EDGE (18–23, top → bottom)
18  الإسكندرية (Alexandria)   property   325
19  حلب (Aleppo)             property   300
20  محاكمة (Court)           card
21  أسوان (Aswan)            property   200
22  دمشق (Damascus)          property   350
23  القاهرة (Cairo)          property   450

24  Jail — سجن الحظ (corner, bottom-right)

  BOTTOM EDGE (25–33, right → left, Jail → Start)
25  الخرطوم (Khartoum)       property   200
26  عمّان (Amman)            property   250
27  الأقصر (Luxor)           property   200
28  بورسعيد (Port Said)      property   200
29  حظك (Luck)               card
30  صنعاء (Sanaa)            property   250
31  محاكمة (Court)           card
32  الكويت (Kuwait)          property   250
33  قطر (Qatar)              property   150
```

- **24 property cities** + **4 corners** (Start, Lucky Club, Fast Bus, Jail) + **6 card
  cells** (4 محاكمة: 10/20/31 + tile 3 if Court; 2–3 حظك: 12/29 + tile 3 if Luck) = 34.
- No Income Tax, no Sales Tax, no Go-To-Jail cell — every cell maps to an **existing tile
  kind**: `start`, `property`, `luck`, `court`, `luckyClub`, `fastbus`, `jail` (البنزينة
  is a `property` in group `U`, like the old petrol-station utility). **No new tile kind
  needed.**

### 1c. Wiring the data (reuse existing patterns)
- **`src/bank/config.ts` → `BOARD`**: rewrite the 34-tile array with the names/prices
  above (helper `property(id, nameKey, group, price, rent)` derives rent table + house
  cost; I'll set `rent` ≈ price/10 to match the existing convention). Assign each city a
  **color group** matching the photo's color bands (adjacent cities share a band; keep
  every group ≥ 2 tiles — asserted) and set **`GROUP_COLORS`** to the photo palette.
  البنزينة → group `U` (utility, unimprovable).
- **`src/bank/types.ts` → `BankTileNameKey`**: replace the name-key union with the real
  keys (`alquds`, `gaza`, `beirut`, `riyadh`, `baghdad`, `benghazi`, `aden`, `bahrain`,
  `casablanca`, `tunis`, `gasStation`, `algiers`, `alexandria`, `aleppo`, `aswan`,
  `damascus`, `cairo`, `khartoum`, `amman`, `luxor`, `portSaid`, `sanaa`, `kuwait`,
  `qatar`, + `start`/`jail`/`luckyClub`/`fastBus`/`luck`/`court`); drop `salesTax`,
  `incomeTax`, `suezCanal`, `banqueMisr`, `mecca`, `medina`, `jeddah`, `cairoHospital`,
  `tripoli`, etc.
- **`src/locales/en/bank.json` + `src/locales/ar/bank.json` → `tiles.*`**: replace to
  match the new keys (EN + AR values). `locales/parity.test.ts` enforces EN↔AR parity, and
  the `BankTileNameKey` union compile-checks every `t('tiles.${nameKey}')`.

### Files touched (Part 1)
`src/bank/config.ts` (dims, BOARD, GROUP_COLORS) · `src/bank/board.ts` (rectangle geometry)
· `src/bank/types.ts` (BankTileNameKey) · `src/locales/{en,ar}/bank.json` (tiles.*) ·
`src/components/bank/board/BankBoard.tsx` (grid + aspect) · `.../BankCenter.tsx` (insets) ·
`src/bank/board.test.ts` (rewritten oracle/counts).

---

## Part 2 — Full visual remake + the three readability fixes

The board today is a **dark theme** (`BankBoardSurface` bg `#0f1424`, white tiles, amber
hub). The photo is **vintage cream/parchment** with a red-brand BANK building and tilted
"stamp" draw cards. This repo uses **no image assets** (audio synthesized, snakes via
d3-shape), so the remake is done in **CSS/SVG** — faithfully evoking the photo (palette,
layout, labels, icons, center composition). A literal pixel-match of the hand-drawn
linework would need the photo embedded as an image, which I'll only do if you want it.

- **`board/BankBoard.tsx`** (`BankBoardSurface`): parchment/cream surface + thick warm
  vintage outer frame (the photo's yellow border).
- **`board/BankTile.tsx`**: vintage card look — cream tile, bold group color bar, bold
  serif-ish name, price beneath; match the photo's special-cell icons (⚖️ court, 🎲 luck,
  fuel pump, the building/club + car corners, Start arrows, jail).
- **`board/BankCenter.tsx`**: rebuild the hub to mirror the photo — a CSS/SVG **bank
  building** motif, **"بنك الحظ"** in bold red, the two tilted **stamp cards**
  (حظك · محاكمة) with dashed/serrated borders, the two dice, and the status line.
- Keep the board's fixed **LTR coordinate space** (`dir="ltr"`) so geometry never mirrors
  under Arabic — already handled.

### The three readability fixes (your notes)
1. **Dice need space between them** — in `BankCenter.tsx` the two `Dice3D` sit in
   `flex items-center gap-1.5` (line 52). Increase the gap (e.g. `gap-3`+) and/or bump
   `size` so the cubes never touch.
2. **Bigger boxes + bigger font** — the new 11×8 board already makes each cell larger than
   the old 11×11; additionally increase the board container (`BankGameScreen.tsx`
   `max-w-[min(92vw,560px)]` → larger, e.g. ~760px desktop) and step up the font sizes in
   `BankTile.tsx` (the `text-[6px] sm:text-[9px]` name/price classes) so names/prices read.
3. **Show the owner's NAME on bought properties, not just the color** — today an owned
   tile only paints an owner-color ribbon (`BankTile.tsx:108`, fed by `ownerColor`). Add
   the owner's **name** (truncated, contrasting text) on that ribbon:
   - `BankTile.tsx`: new `ownerName?: string | null` prop; render it over the owner-color
     ribbon (give the ribbon a touch more height for legibility).
   - `board/BankBoard.tsx` (`BankBoardSurface`): pass `ownerName={players[owner]?.name}`;
     add a `names` prop and include it in the `memo` comparator (currently keyed on
     `ownership` + `colors` only) so a name change re-renders.

### Files touched (Part 2)
`board/BankBoard.tsx` · `board/BankTile.tsx` · `board/BankCenter.tsx` ·
`BankGameScreen.tsx` · possibly a new parchment theme token in the Tailwind v4 CSS block ·
maybe `board/BankToken.tsx` (token contrast on the lighter board).

---

## Part 3 — Luck/Court card confirmation popup with money calculation

### Current flow (to change)
- `resolveTurn` (`rules.ts:380–391`) draws the card, applies its money effect to a working
  `cash[]` array, and pushes `{kind:'card'}` then the resulting cash/collect/pay effect(s).
- `executeTurn` (`useBankElHazz.ts:260–265`) sets `cardReveal` and **`await
  delay(timings.luck)`** (1.5s auto-dismiss).
- `BankCardModal.tsx` is **display-only**: text, no button, no calculation.

### 1. Bake the calc into the resolution (pure, replay-safe, testable)
In `resolveTurn`'s `luck/court` case, capture the drawer's running balance around the card:
```ts
const before = cash[seat]
resolving = applyCard(card)
const after = cash[seat]
effects.push({ kind: 'card', deck, cardId: card.id,
               balanceBefore: before, delta: after - before, balanceAfter: after })
```
Captures the card's direct cash impact: `cash`/`maintenance`/`payEach` (debit),
`collectEach`/pass-reward (credit); `move`/`jail`/`getOutFree` → delta 0.
- `types.ts`: extend the `card` `TurnEffect` with **optional** `balanceBefore?`, `delta?`,
  `balanceAfter?` (optional mirrors the existing `extraTurn?`/`doublesCount?` back-compat
  pattern; live play always sets them).

### 2. Require a Confirm click in `executeTurn` (replaces the timed delay)
Add a one-shot acknowledge promise in `useBankElHazz`:
```ts
const ackRef = useRef<(() => void) | null>(null)
const waitForCardAck = () => new Promise<void>(r => { ackRef.current = r })
const acknowledgeCard = useCallback(() => { const r = ackRef.current; ackRef.current = null; r?.() }, [])
```
- `case 'card'`: set `cardReveal` (now `{ seat, deck, cardId, balanceBefore, delta,
  balanceAfter }`), then `await waitForCardAck()` instead of `await delay(timings.luck)`.
- Extend `BankCardReveal` (`useBankElHazz.ts:69`) with the three numbers.
- In **`clearTransients`** (reset/undo/new-game/restart) flush the pending ack
  (`ackRef.current?.(); ackRef.current = null`) so a cancelled run never hangs.
- Expose `acknowledgeCard` on the controller.
- **Bots:** no special case — the pause holds `phase === 'moving'`, and the bot driver
  (`useBankBotAutoPlay`) only fires on `phase === 'idle'`, so it waits for the human click.

### 3. Redesign `BankCardModal.tsx`
- Add a **Confirm button** (new key `cards.confirm`), auto-focused; Enter/Escape confirm;
  remove the auto-dismiss (modal persists until acknowledged).
- When `delta` is non-zero, render a **calculation block**: `cards.before` "You have" →
  `{{n}} LE` · signed `±{{n}} LE` (green credit / red debit) · `cards.after` "Total" →
  `{{n}} LE`, using the existing `money` formatter, `tabular-nums`, RTL-safe logical utils.
- Wire the button to `game.acknowledgeCard` in **`BankGameScreen.tsx`** (modal already in
  its `<AnimatePresence>`, lines 150–157); pass the new reveal fields.

### Files touched (Part 3)
`rules.ts` · `types.ts` · `useBankElHazz.ts` · `BankCardModal.tsx` · `BankGameScreen.tsx` ·
`locales/{en,ar}/bank.json` (`cards.confirm`/`cards.before`/`cards.after`) · maybe
`rules.test.ts` fixtures (new fields are optional, so adjust only any that assert exact
`card`-effect shape).

---

## Verification
- `npm run test` — `board.test.ts` (rewritten 11×8 oracle/counts), `rules.test.ts`,
  `locales/parity.test.ts` pass.
- `npm run lint` + `npm run build` (tsc) — clean (the `BankTileNameKey` changes are
  compile-checked against every `t('tiles.…')`).
- `npm run dev` → `/bank` → local 2-player match:
  - Board is the landscape 11×8 shape, matches the photo (cities, prices, no Sales/Income
    Tax, vintage look); tiles & font readable; dice spaced apart; bought properties show
    owner **name + color**.
  - Land on حظك / محاكمة → popup **stays** until Confirm; money cards show the
    before/±/after calc; non-money cards show text + Confirm; bot draws block on the click.
  - Walk the full loop (Start → up left → across top → down right → across bottom → Start)
    and confirm tokens land on the right cells and pass-Start pays at tile 0.
  - Reset / New Game while a popup is open doesn't hang the game.
- Run the **expect** skill (adversarial browser test) on `/bank`.

## Open items for the user (small — I'll default these if you don't specify)
- **Tile 3** card cell: حظك (Luck) or محاكمة (Court)? (default: Luck.)
- **Color-group split** for the cities (default: mirror the photo's color bands, 2–3 tiles
  each).
- Confirm the CSS/SVG vintage remake is acceptable (vs. embedding the photo for a literal
  pixel match).
