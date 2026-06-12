<div align="center">

# 🎲 Robin&apos;s Games

### A hub of polished, animated board games — play on one screen or online.

**Robin&apos;s Games** is a multi-game arcade. Pick a game from the hub at `/` and play
**pass-and-play on one screen** or **online across computers** in real time. Every game lives on its
own route. Built with React 19, TypeScript, Tailwind CSS v4, React Router, and Motion.

<br />

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white)
![Supabase Realtime](https://img.shields.io/badge/Supabase-Realtime-3ecf8e?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-7c3aed)

<!-- Drop a gameplay GIF or screenshot here once you have one:
<img src="docs/demo.gif" alt="Snakes & Ladders gameplay" width="720" />
-->

</div>

---

## 🎮 Games

| Game | Route | About |
| --- | --- | --- |
| 🐍 **Snakes & Ladders** | `/snakes` | Climb the ladders, dodge the snakes, race to 100. |
| 🎲 **Ludo** | `/ludo` | Race all four tokens home — capture, block, roll a six. *(coming soon)* |

The landing page at `/` is the **Robin&apos;s Games** hub; each game is lazy-loaded on its own route,
so the hub and Snakes never download Ludo's code (and vice-versa). Deep links work out of the box via
the Netlify SPA fallback.

---

## ✨ Snakes & Ladders highlights

🎲 **A real 3D dice** — a CSS `preserve-3d` cube that genuinely tumbles in space and settles on the
rolled face.

🏃 **Tokens that tell a story** — they *hop* cell by cell, *climb* ladders rung by rung, and *slide*
down snakes, so every turn is readable at a glance.

🌐 **Online multiplayer, no backend to babysit** — create a room, share a 4-letter code, and play
with up to **4 players** on different computers over Supabase Realtime. No database, no game server.

🔇 **Sound from thin air** — every effect (roll, step, ladder, snake, victory) is synthesized live
with the Web Audio API. Zero audio files ship. Mute toggle included.

🎉 **A finish worth racing to** — every finisher gets a confetti celebration, and with 3–4 players
the race keeps going for 2nd and 3rd place until a full medal podium is set. Rolling a 6 fires a
"Lucky 6!" fanfare and grants another roll.

🪂 **Drop-out proof** — if the player whose turn it is leaves an online match, their turn is skipped
automatically and everyone is notified; the game never gets stuck.

♿ **Accessible &amp; responsive** — roll with `Space`/`Enter`, `aria-live` turn announcements, full
`prefers-reduced-motion` support, and a layout that flows from desktop side-by-side to mobile stacked.

---

## 🎯 How to win

It's the board game you already know — faithfully:

| Rule | Behavior |
| --- | --- |
| 🪜 **Ladders** | Land on a ladder's foot and you're whisked to the top. |
| 🐍 **Snakes** | Land on a snake's head and you slither back down to its tail. |
| 🎲 **Roll a 6** | Take an **extra turn** (with a celebratory fanfare). |
| 🏁 **Land on 100 exactly** | Overshoot the final cell and your token **bounces back** — you must hit 100 on the nose to win. |
| 🥇 **3–4 players** | The first finisher takes **1st place** and the race continues (the host decides) until only one player is left — the final podium shows 1st/2nd/3rd. |

---

## 🕹️ Two ways to play

<table>
<tr>
<td width="50%" valign="top">

### 🎲 Pass &amp; Play
2–4 players, **one screen**, taking turns on the same device. Pick names and token colors on the
setup screen and go. No setup, no keys, works offline.

</td>
<td width="50%" valign="top">

### 🌐 Play Online
**Create a room** to get a shareable 4-letter code, or **join** one a friend sends you. Up to 4
players across different computers stay perfectly in sync. *(Requires free Supabase keys — see
[below](#-enabling-online-play).)*

</td>
</tr>
</table>

---

## 🚀 Quick start

```bash
npm install
npm run dev      # → http://localhost:5173
```

That's it — **Pass &amp; Play works immediately**. Online play also works in development without any
keys via a same-browser test mode: just open the app in **two browser tabs** and create/join the
same room.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Type-check (`tsc -b`) and produce an optimized build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run test` | Run the game-logic unit tests once (Vitest). |
| `npm run test:watch` | Run the tests in watch mode. |
| `npm run lint` | Lint the project with ESLint. |

---

## 🔌 Enabling online play

Online mode talks to **Supabase Realtime** — only its broadcast and presence channels, so there are
**no database tables to create**.

1. Create a free project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in the two values from
   **Project Settings → API**:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

   > These are **public** client keys — safe to expose in the browser.

3. Restart `npm run dev`. The **Play Online** card unlocks automatically.

Leave the keys unset and online play falls back to a same-browser BroadcastChannel **test mode**, so
you can develop and demo multiplayer with two tabs and no backend at all.

---

## 🧠 Architecture

The guiding principle: **pure game logic is fully decoupled from React, from animation timing, and
from networking.** Each layer has one job and never reaches across the boundary.

```
┌──────────────────────────────────────────────────────────────────────┐
│  components/        Thin presentational React (board, dice, panels)    │  the view
├──────────────────────────────────────────────────────────────────────┤
│  hooks/             useSnakesAndLadders — the ONE orchestration facade  │  the conductor
│                     (mixes reducer + rules + sound + animation timing)  │
├───────────────────────────────────┬──────────────────────────────────┤
│  game/   pure, deterministic,     │  net/   transport-agnostic         │  the engine
│          framework-free rules     │         realtime multiplayer       │
└───────────────────────────────────┴──────────────────────────────────┘
```

- **`game/`** decides *what happens* and nothing else — no DOM, no timers, no randomness baked in
  (`rollDie` takes an injectable RNG, so tests are deterministic). The whole outcome of a roll is
  computed once into a single **`TurnResolution`** value (walk path, bounce, snake/ladder, final
  cell, win, extra-turn). Every tunable — the snake/ladder map, palette, timings — lives in
  `game/config.ts`.

- **`hooks/useSnakesAndLadders`** is the only place that mixes the reducer, rules, sound, and
  motion. Components depend on the clean controller object it returns — never on the reducer or
  timers directly.

- **`net/`** speaks to a `Transport` interface, never to Supabase directly. That's why the exact
  same code runs cross-computer (Supabase) or same-browser (BroadcastChannel dev fallback). Room
  membership (seats, capacity, name/color uniqueness) is computed by **pure** rules every client
  folds identically — so clients agree on the roster **without an authoritative server**.

### The clever bit: one resolution, replayed everywhere

A turn is computed **once** and replayed identically on every screen, so two computers can't drift
out of sync:

```
You roll ─▶ resolveTurn() ─▶ TurnResolution ─┬─▶ executeTurn()   animate it on your screen
                                             │
                                             └─▶ broadcast over the Transport ─ ─ ─ ─ ─ ┐
                                                                                        ▼
Opponent ◀─ animate ◀─ executeTurn() ◀─ queued ◀─ applyRemoteTurn() ◀─ same TurnResolution
```

Because both sides animate the *same* resolved data, the dice, the hops, and the snake-slide land on
exactly the same cells — frame-independent and lag-tolerant.

### Project structure

```
src/
├─ main.tsx                    # bootstrap: createRoot → <Root/>
├─ Root.tsx                    # BrowserRouter: / → hub · /snakes → Snakes · /ludo → Ludo (lazy)
├─ App.tsx                     # Snakes & Ladders shell (the /snakes 3-mode switch)
├─ game/          # pure, framework-free, unit-tested logic
│  ├─ config.ts        # board layout, snakes/ladders, palette, timings (single source of truth)
│  ├─ board.ts         # boustrophedon cell ⇄ (row,col) mapping
│  ├─ rules.ts         # rollDie() + resolveTurn() → TurnResolution
│  ├─ gameReducer.ts   # pure phase machine: setup → idle → rolling → moving → celebrating → won
│  ├─ types.ts         # shared domain shapes (TurnResolution is the key contract)
│  └─ rules.test.ts    # Vitest unit tests
├─ hooks/
│  ├─ useSnakesAndLadders.ts   # orchestration facade (local + remote share one turn engine)
│  └─ useSound.ts              # mute state over the sound engine
├─ net/           # realtime multiplayer behind a Transport interface
│  ├─ supabaseTransport.ts     # cross-computer (Supabase Realtime broadcast + presence)
│  ├─ broadcastTransport.ts    # same-browser dev fallback (BroadcastChannel)
│  ├─ roster.ts                # pure seat/capacity/uniqueness rules (+ tests)
│  └─ useRoom.ts               # picks a transport, exposes a tiny room API
├─ audio/soundEngine.ts        # Web Audio oscillator effects (no files)
├─ components/                 # board/, dice/, online/, panels & overlays
│  ├─ HomeHub.tsx              # the Robin's Games landing (data-driven game cards)
│  ├─ Backdrop.tsx             # shared night/gradient/blob chrome for every route
│  ├─ BackToHubLink.tsx        # "← Robin's Games" back-affordance
│  └─ ludo/LudoApp.tsx         # the /ludo route (placeholder today)
└─ lib/
   ├─ cn.ts                    # className helper
   └─ useDocumentMeta.ts       # per-route title + canonical + OG/Twitter SEO
```

---

## 🧪 Testing

The pure layers (`game/` and `net/roster.ts`) are unit-tested with **Vitest** — no DOM required.

```bash
npm run test                              # everything, once
npx vitest run src/game/rules.test.ts     # a single file
npx vitest run -t "bounces back"          # filter by test name
```

---

## 🧰 Built with

- **[React 19](https://react.dev)** + **[TypeScript](https://www.typescriptlang.org/)**
- **[Vite 8](https://vite.dev)** — dev server &amp; build
- **[Tailwind CSS v4](https://tailwindcss.com)** — styling (configured in CSS, no `tailwind.config`)
- **[Motion](https://motion.dev)** (Framer Motion) — animation
- **[d3-shape](https://d3js.org/d3-shape)** — smooth snake curves
- **[Supabase Realtime](https://supabase.com/realtime)** — online play
- **Web Audio API** — synthesized sound effects

---

## ☁️ Deployment

Configured for **[Netlify](https://www.netlify.com/)** out of the box (`netlify.toml`): it runs
`npm run build`, publishes `dist/`, and serves `index.html` as an SPA fallback for every route. Set
the `VITE_SUPABASE_*` environment variables in your Netlify site settings to enable online play in
production. Any static host that can serve a Vite SPA works just as well.

---

<div align="center">

**MIT Licensed** · Made with 🎲 and a lot of `preserve-3d`

</div>
