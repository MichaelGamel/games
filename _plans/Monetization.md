# Monetization Layer for Robin's Games

## Context

**Goal:** Add revenue to the multi-game hub via all four chosen paths — display ads, a donation
button, in-game rewarded ads, and paid premium cosmetics.

**The honest framing (read this first):** Money follows traffic. With a casual-game RPM of roughly
**$1–5 per 1,000 pageviews**, ~10k pageviews/month ≈ $10–50/month. Meaningful income needs real
audience, and the higher-paying ad networks gate on it (Ezoic ~10k visits/mo, Mediavine ~50k
sessions/mo, Raptive ~100k). So this plan ships the cheap, no-backend earners *first* (ads +
donation + local cosmetics), and defers the expensive backend (real Stripe payments) until there's
an audience worth charging.

**Architectural reality this respects:** The site is static (Netlify) and serverless. Supabase is
currently wired for **Realtime only** — `src/net/supabaseClient.ts` sets `auth: { persistSession:
false }`, there is **no database, no accounts** (confirmed against CLAUDE.md and code). Therefore:

- Display ads, donation button, **local** cosmetics, and rewarded-ad **gating UI** need **zero backend**.
- **Real paid purchases** require new infrastructure: Supabase Auth + a `purchases` table (RLS) + a
  server function (Supabase Edge Function) holding the Stripe **secret** key + a webhook. This is a
  deliberate, isolated addition — it does not touch the game/net engine.

## Phasing (recommended order)

- **Phase 1 — Ship now, no backend:** AdSense display slots, donation button, local cosmetics shop +
  selection, ad-free toggle scaffolding (honor-system at first), rewarded-ad gate UI (stubbed
  reward). Plus compliance (privacy policy + cookie consent) which AdSense *requires* for approval.
- **Phase 2 — Real payments:** Supabase Auth (email/OAuth), `purchases` table, Stripe Checkout via
  an Edge Function + webhook, entitlement sync on login. Flips the ad-free toggle and cosmetic
  ownership from honor-system to real.
- **Phase 3 — Real rewarded video:** Integrate a web ad network that actually serves rewarded ads
  (Google Ad Manager H5 Games Ads, or a web-game network). Phase 1 ships the *gate*; Phase 3 fills
  in the *ad*.

---

## Phase 1 — No-backend earners

### A. Display ads (Google AdSense)

- **Script:** add the AdSense loader to `index.html` `<head>` (no CSP currently, so nothing blocks
  it). Gate the client id behind an env var so it's a no-op without keys.
- **Config:** extend `src/net/config.ts` with `ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID`
  and an `isAdsConfigured` flag, mirroring the existing `isSupabaseConfigured` pattern. Add the var
  to `.env.example`.
- **Component:** new `src/components/monetization/AdSlot.tsx` — renders an `<ins class="adsbygoogle">`
  + the `push({})` call in a `useEffect`. Renders **nothing** when ads aren't configured, when
  `import.meta.env.DEV` (avoid invalid-traffic penalties), **or when the user is ad-free** (reads
  entitlements, see §C). Styled with the existing frosted-glass tokens (`bg-white/5 ring-1
  ring-white/10 rounded-2xl`) and an "Advertisement" disclosure label (i18n).
- **Placements (non-intrusive — never over the board):**
  - Hub: one slot between the header and the games grid in `src/components/HomeHub.tsx`.
  - Game menus: one slot below the play/options block in each `*App.tsx` menu view.
  - End-of-game overlays (highest engagement): `src/components/WinnerOverlay.tsx`,
    `src/components/chess/ChessGameOverlay.tsx`, `four/DrawOverlay.tsx`, `xo/XODrawOverlay.tsx`.

### B. Donation button

- New `src/components/monetization/DonateButton.tsx` — a plain external link
  (`target="_blank" rel="noopener noreferrer"`) to a **Ko-fi** page (recommended: lower fees than
  Buy Me a Coffee; confirm handle at build time). Reuse the chrome button styling.
- Placement: top-right of the hub next to `LanguageSwitcher` in `HomeHub.tsx`, and a softer "Enjoying
  this? Support us 💙" variant inside the end-game overlays.

### C. Local cosmetics + ad-free entitlements (no payment yet)

- New `src/lib/entitlements.ts` — follows the **exact `src/lib/stats.ts` pattern** (one versioned
  key `rg-entitlements-v1`, load→modify→save) using `loadLocal`/`saveLocal` from `src/lib/storage.ts`
  (the only sanctioned localStorage path). Shape: `{ isPremium, ownedCosmetics[], selectedCosmetics }`.
- New `src/lib/cosmetics.ts` — catalog arrays modeled on the existing `SNAKE_THEMES` array in
  `src/components/board/snakeStyles.ts`. Define `BOARD_SKINS`, `DICE_SKINS`, and chess
  `PALETTE_VARIANTS` (the chess `PALETTE` object in `src/chess/config.ts` becomes the default variant).
  Each entry: `{ id, name, price, free }`.
- New `src/components/monetization/CosmeticsShop.tsx` — grid of skins with owned/locked/selected
  states; reachable from the hub and/or each game menu. Selecting a skin writes `selectedCosmetics`
  via `entitlements.ts`.
- **Wire skins into renderers** through the existing `GameController` → component prop flow (no engine
  changes — cosmetics are presentation-only):
  - Dice: add a `skin` prop to `src/components/dice/Dice3D.tsx`, driven by `DICE_SKINS`.
  - Snakes board/snakes: parametrize the theme cycle in `snakeStyles.ts`.
  - Chess: pass the selected `PALETTE_VARIANTS` entry into `src/chess/three/ChessScene.ts`.
- An "Unlock" button in the shop currently just grants locally (honor system) — Phase 2 swaps it for
  Stripe Checkout. This keeps the whole UI shippable before any backend exists.

### D. Rewarded-ad gate (UI now, real ad in Phase 3)

- Natural gate points found in exploration:
  - **Ludo undo** — `src/hooks/useLudo.ts` (`undo`, ~line 436): add a per-match/daily undo allowance;
    beyond it, show "Watch a video for more undos."
  - **Chess hints** — none exist today; add a `requestHint()` to the chess controller
    (`src/hooks/useChessGame.ts`) backed by the existing AI engine (`src/chess/ai.ts`), gated by a
    `hintsRemaining` counter.
  - **End-game overlays** — "Watch an ad to unlock a cosmetic."
- New `src/lib/rewardedAds.ts` — a single `showRewardedAd(): Promise<boolean>` seam. Phase 1
  resolves it via a stub modal (instant grant in dev); Phase 3 swaps the body for the real network
  call. Everything upstream stays unchanged.

### E. Compliance (required for AdSense approval — do not skip)

- Add a **Privacy Policy** route/page (ads + analytics use cookies) and link it in the chrome.
- Add a lightweight **cookie-consent** banner (EU/GDPR) that withholds personalized-ads init until
  consent. New `src/components/monetization/ConsentBanner.tsx`, persisted via `storage.ts`.
- AdSense also needs a publicly reachable site with real content/traffic before it approves the
  account — flag this as a gating prerequisite, not a code task.

### F. i18n (all new strings)

- Add a `monetization.*` block to `src/locales/en/common.json` **and** `src/locales/ar/common.json`
  (donation label/aria, ad disclosure, shop labels, rewarded-ad copy, consent banner, privacy link).
  `src/locales/parity.test.ts` fails CI if EN/AR drift — both must be updated together.

---

## Phase 2 — Real payments (the only backend work)

Isolated from the game engine. Touches net/config + new auth/payment modules only.

1. **Supabase Auth:** flip `persistSession: true` in `src/net/supabaseClient.ts` (or a separate
   client instance to avoid disturbing the Realtime transport), add a minimal sign-in UI (email
   magic-link or Google OAuth).
2. **DB:** `purchases` table (`user_id`, `product_id`, `stripe_payment_intent_id`, `amount_cents`,
   `purchased_at`) with **RLS** so users read only their own rows. (Supabase migration.)
3. **Stripe via Supabase Edge Functions** (keeps the secret key server-side; co-located with the DB):
   - `create-checkout-session` — returns a Stripe Checkout URL.
   - `stripe-webhook` — on `checkout.session.completed`, inserts into `purchases` with the service role.
   - Env: `VITE_STRIPE_PUBLISHABLE_KEY` (client, public) + `STRIPE_SECRET_KEY` (function-only, never
     in `.env`/VITE).
4. **Entitlement sync:** on login, fetch `purchases` → merge into local `entitlements.ts`. The
   "Unlock" / "Remove ads" buttons from Phase 1 now launch Checkout instead of granting locally.

> Alternative considered: Netlify Functions (already on Netlify) for the Stripe endpoints. Rejected
> because the webhook must write to the Supabase DB with the service role — keeping it as a Supabase
> Edge Function co-locates secret + DB and avoids a second platform's secrets. Note either way.

---

## Phase 3 — Real rewarded video

Swap the body of `src/lib/rewardedAds.ts` `showRewardedAd()` to call a network that actually serves
rewarded ads on the web (Google Ad Manager **H5 Games Ads**, or a web-game ad network such as
GameMonetize/AdinPlay). No call sites change — the gates from Phase 1 light up for real.

---

## Files at a glance

**New:** `src/lib/entitlements.ts`, `src/lib/cosmetics.ts`, `src/lib/rewardedAds.ts`,
`src/components/monetization/{AdSlot,DonateButton,CosmeticsShop,ConsentBanner}.tsx`, a Privacy Policy
page, (Phase 2) Supabase migration + `supabase/functions/{create-checkout-session,stripe-webhook}`,
a sign-in UI.

**Modified:** `index.html` (AdSense script), `src/net/config.ts` + `.env.example` (ad/Stripe env),
`src/components/HomeHub.tsx` (ad slot + donate), each `*App.tsx` menu + end-game overlays
(`WinnerOverlay.tsx`, `chess/ChessGameOverlay.tsx`, `four/DrawOverlay.tsx`, `xo/XODrawOverlay.tsx`),
`src/components/dice/Dice3D.tsx`, `src/components/board/snakeStyles.ts`, `src/chess/config.ts` +
`src/chess/three/ChessScene.ts`, `src/hooks/useLudo.ts` (undo gate), `src/hooks/useChessGame.ts`
(hints), `src/locales/{en,ar}/common.json`, (Phase 2) `src/net/supabaseClient.ts`.

**Reuse (don't reinvent):** `loadLocal/saveLocal` (`storage.ts`), the `stats.ts` persistence shape,
the `SNAKE_THEMES` array + chess `PALETTE` as cosmetic-catalog templates, the `isSupabaseConfigured`
env pattern, the chrome button styles, the `GameController` prop flow, the i18n namespace + parity test.

## Verification

- **Phase 1 local:** `npm run dev` → confirm donate link opens Ko-fi; ad slots render placeholders
  with a valid `VITE_ADSENSE_CLIENT_ID` and render nothing in DEV / when ad-free / when unconfigured;
  cosmetics shop selection persists across reload (localStorage) and visibly changes dice/board/chess
  skins; rewarded-ad stub grants undos/hints; consent banner gates ad init.
- **Lint/test/build:** `npm run lint`, `npm run test` (incl. `locales/parity.test.ts` for EN/AR), and
  `npm run build` must all pass. Keep any new pure logic (entitlements/cosmetics catalog) unit-tested
  under `src/**/*.test.ts` per the existing node-only test setup.
- **Phase 2 payments:** Stripe test-mode end-to-end (Checkout → webhook → `purchases` row → login
  sync flips `isPremium`/ownership); verify RLS blocks cross-user reads.
- **AdSense:** account approval against the deployed Netlify site (real content + privacy policy +
  consent) before real ads serve.
