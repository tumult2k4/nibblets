# Nibblets

A little low-poly god game about big-eared goblins. They hatch from eggs, grow up, eat apples and plant the cores, chop bushes for wood, build huts against the rain, sharpen spears against the Gnashers that come at night, fall in love, lay eggs, pull pranks, mourn their dead and pass their looks and their knowledge to their young. Nobody scripts any of it. You are their god: you watch, nudge, and read what they write about it.

Built from `NIBBLETS_DESIGN_DOC.md`. What was built when is in `PROGRESS.md`, and why it works the way it does is in `DECISIONS.md`.

## Run

You need Node 20 or newer.

```bash
npm install
npm run dev        # then open http://localhost:5173
```

`npm run build` makes a static build in `dist/` (serve it with `npx vite preview`). Everything runs in the browser; saves live in the browser's storage and can be exported and imported as files from the Load screen.

## Playing

Start a **New World** from the title screen. The wizard asks for the land (seed, size, and an island, valley, archipelago or riverlands), the founders (their clan's look and how many) and the rules: difficulty, gentle mode (the hand does no harm), LLM voices, and the mode, which is fixed for that world:

- **Sandbox**: every power is free, plus the Sandbox drawer (B) to spawn, breed, edit genomes and possess a goblin.
- **Divine**: powers unlock as the village comes to believe in you, and every act costs favor, which you earn from their faith and prayers.
- **Observer**: no powers at all; you only watch.

Click a goblin to see its needs, mind, friends, body and pack. Press F1 in the game for an illustrated help sheet, and Esc for the menu (save, load, settings, help).

## Controls

Every key can be rebound in Settings → Controls (a clash swaps the two keys).

| Mouse | |
|---|---|
| Click a goblin | select it (drag on empty ground: box select) |
| Press and drag a goblin | pick it up; let go low to set it down, high or with a fling to throw |
| Wheel while holding | raise or lower it |
| Hold still on a goblin / double-click / Alt+click | pet / poke / flick |
| Right-drag, middle-drag, wheel | orbit, pan, zoom |

| Key | | Key | |
|---|---|---|---|
| Space | pause | 1–4 | speed |
| WASD, arrows | pan | Q / E | rotate |
| H | the hand | G | gift tray (apples, water, materials) |
| T / R / Z / M | terraform / nature / wrath / miracle powers | V | the Voice (speak to the goblins) |
| Tab | next goblin | F | follow the selected goblin |
| L | next lens (needs, faith, mood, genes, fertility, moisture, paths, temperature, danger) | , | place names on the map |
| I / N | inspector / feed | Y / K | village / family tree |
| O / P | stats / prayers | J | journal (diaries, books, eulogies, chronicle) |
| X / U | codex / timeline | C | director camera |
| B | Sandbox drawer | F12 | photo mode |
| F5 / F9 | quick save / quick load | F1 | help |
| F6 | move into the panels (keyboard-only play) | Esc | leave the panels, close, menu |

**Keyboard only**: F6 moves into the next open panel or into the open dialog. Inside, Tab and Shift+Tab go from control to control, Enter or Space presses, and Esc hands the keyboard back to the world. Everything except the hand's throwing and the terraform brush strokes can be played this way.

**Accessibility** (Settings → Access): UI scale, reduced motion (no camera shake, no UI animation), high-contrast panels, color-blind-safe colors (the goblins keep their own skin colors, which are genetic), and the journal's text size.

## LLM mode (optional)

The goblins can get voices: diaries at dawn, dialogue and barks in speech bubbles, books written by the learned, a eulogy at a grave, an elder's seasonal chronicle, names for places, and answers when you speak to them with the Voice. **The LLM only narrates and translates, it never decides**: the simulation runs the same with LLM mode on or off, and a world replays identically either way. Words from the sky are turned into a small set of intents the goblins may or may not understand.

LLM mode is on from the start with the built-in texts. Settings → Voices (LLM) turns it off or picks another provider:

- **Built-in (offline templates)**: the default. No network and no key; texts come from templates written for the game.
- **Local proxy (recommended)**: a small server in this repo that holds your API key, so the key never reaches the browser.

  ```bash
  ANTHROPIC_API_KEY=… NIBBLETS_MODEL=<model name> npm run llm-proxy   # listens on http://localhost:8787
  ```

- **Ollama**: a local model at `http://localhost:11434`; set the model name.
- **Anthropic API, direct**: for developers only. The key is kept in this browser and sent from the page, where anything running in it can read it.

The Test button asks the chosen provider for one line. Each in-game day has a budget (tokens, with a sub-cap for the Voice, and counts of diaries, dialogues, barks and books); requests are rate-limited and the most interesting ones go first. A request that fails gets the built-in text instead, and three failures in a row rest LLM mode for ten in-game minutes. Once a day's budget is spent, nothing more is written that day; the game itself goes on the same.

## Development

```bash
npm run typecheck && npm run lint && npm run test && npm run build
npm run balance -- --days 96 --seeds 5      # headless balance report → balance-report.md
npx tsx tools/perf.ts                       # 150 goblins, 600 plants, 20 Gnashers: ms per tick
```

- `src/sim` is the simulation: pure, deterministic TypeScript at 10 ticks a second with its own seeded random stream. It never imports the renderer, the UI or the LLM layer, and every change from the player goes in as a command, so any world replays from its seed and command log.
- `src/render` (three.js) and `src/ui` (plain DOM) only read the world; `src/llm` holds the LLM layer.
- Every tunable lives in `src/sim/config.ts` and `src/sim/cfg/`.
- The balance runner flags extinction, overpopulation, starvation, tick time over 2 ms and more; `--god <profile>` plays a Divine world with a scripted god (`benevolent`, `wrathful`, `chaotic`…), `--free` a Sandbox one.
