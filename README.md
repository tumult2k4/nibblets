# Nibblets

A little low-poly god game about big-eared goblins. Built from `NIBBLETS_DESIGN_DOC.md`; progress in `PROGRESS.md`.

## Run
```bash
npm install
npm run dev        # open http://localhost:5173
```

## Checks
```bash
npm run typecheck && npm run lint && npm run test && npm run build
npm run balance -- --days 10 --seeds 5   # writes balance-report.md
```

## Controls (rebindable in Settings → Controls)
- Left-drag empty ground: box select · click a goblin: inspect · drag a goblin: pick it up
- Mouse wheel while holding: raise/lower · release low: set down gently · release high or fling: drop/throw
- Hold still on a goblin: pet · double-click: poke · Alt+click: flick
- G: gift tray (drag apples/water/materials into the world) · Space: pause · 1–4: speed
- WASD pan, Q/E rotate, wheel zoom · F follow · L lens · H hand tool · Tab next goblin · F5/F9 quick save/load · F1 help · Esc menu
