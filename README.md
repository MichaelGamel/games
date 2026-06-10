# 🐍 Snakes & Ladders 🪜

A polished, heavily-animated two-player Snakes & Ladders game built with **React 19**,
**TypeScript**, **Tailwind CSS v4**, and **Framer Motion**.

![board](https://img.shields.io/badge/players-2-7c3aed) ![board](https://img.shields.io/badge/cells-100-10b981)

## Features

- **2-player local play** with a setup screen for custom names and token colors.
- **3D rolling dice** — a real CSS `preserve-3d` cube that tumbles and settles on the rolled face.
- **Animated tokens** that hop along the board, climb ladders, and slide down snakes.
- **Classic rules**: roll a **6** for an extra turn, and you must land **exactly on 100** to win
  (overshoots bounce back).
- **Synthesized sound effects** (Web Audio — no asset files) for rolling, stepping, ladders, snakes,
  and victory, with a mute toggle.
- **Winner celebration** with a confetti burst and trophy animation.
- **Accessible & responsive**: keyboard roll (Space/Enter), `aria-live` status announcements, and
  `prefers-reduced-motion` support; layout adapts from desktop side-by-side to mobile stacked.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build    # type-check (tsc) + production build
npm run test     # run the game-logic unit tests (Vitest)
npm run lint     # eslint
```

## Architecture

The codebase is structured so that **pure game logic is fully decoupled from React and from
animation timing** (SOLID / KISS / DRY).

```
src/
├─ game/         # pure, framework-free, unit-tested logic
│  ├─ config.ts      # board layout, snakes/ladders, colors, timings (single source of truth)
│  ├─ board.ts       # boustrophedon cell ⇄ coordinate mapping
│  ├─ rules.ts       # rollDie() + resolveTurn() (bounce / jump / win / extra-turn)
│  ├─ gameReducer.ts # pure state transitions (phase machine)
│  └─ rules.test.ts  # Vitest unit tests
├─ hooks/
│  ├─ useSnakesAndLadders.ts  # orchestration facade: wires reducer + rules + sound + timing
│  └─ useSound.ts             # mute state over the sound engine
├─ audio/soundEngine.ts       # Web Audio oscillator effects (no files)
├─ components/                 # thin presentational React (board, dice, panels, overlays)
└─ lib/cn.ts                   # className helper
```

- **`game/`** decides *what happens*; it never touches the DOM, timers, or randomness
  (`rollDie` takes an injectable RNG for deterministic tests).
- **`useSnakesAndLadders`** is the only place that mixes the reducer, rules, sound, and animation
  timing. Components depend on the clean object it returns — never on the reducer or timers directly.
- All tunables (the snake/ladder map, palette, animation durations) live in **`game/config.ts`**.

## License

MIT
