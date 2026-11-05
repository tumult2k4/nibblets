import { describe, expect, it } from 'vitest';
import { Rng } from '../../shared/rng';
import { createWorld, createWorldState } from '../newWorld';
import { replayTo, stateHash } from '../save';
import { World } from '../world';
import type { Command } from '../commands';

describe('replay (§17.8)', () => {
  it('seed + command log (≥ 50 god commands) reproduces the hash', () => {
    const w = createWorld({ seed: 77 });
    const r = new Rng(123); // test-side randomness for the "player"
    for (let t = 0; t < 4000; t++) {
      if (t % 60 === 5 && !w.s.god.held && w.s.goblins.length) {
        const g = w.s.goblins[r.int(0, w.s.goblins.length - 1)]!;
        const kind = r.int(0, 4);
        if (kind === 0) w.push({ type: 'god_grab', entityId: g.id });
        if (kind === 1) w.push({ type: 'god_spawn_item', item: r.pick(['apple', 'wood', 'stone'] as const), qty: r.int(1, 5), pos: { x: g.pos.x + 1, y: g.pos.y } });
        if (kind === 2) w.push({ type: 'god_pet', goblinId: g.id, ticks: 20 });
        if (kind === 3) w.push({ type: 'god_poke', goblinId: g.id });
        if (kind === 4) w.push({ type: 'god_flick', goblinId: g.id, dir: { x: r.range(-1, 1), y: r.range(-1, 1) } });
      }
      const h = w.s.god.held;
      if (h && t % 60 > 5 && t % 60 < 25) w.push({ type: 'god_hold_move', pos: { x: h.pos.x + r.range(-0.3, 0.3), y: h.pos.y + r.range(-0.3, 0.3) }, height: r.range(1, 6) });
      if (h && t % 60 === 25) {
        const throwIt = r.chance(0.5);
        const cmd: Command = { type: 'god_release', pos: h.pos, height: r.range(1, 5), velocity: throwIt ? { x: r.range(-12, 12), y: r.range(-12, 12), z: r.range(0, 4) } : { x: 0, y: 0, z: 0 } };
        w.push(cmd);
      }
      w.step();
    }
    const kinds = new Set(w.s.commandLog.map((c) => c.cmd.type));
    expect(w.s.commandLog.length).toBeGreaterThanOrEqual(50);
    for (const k of ['god_grab', 'god_release', 'god_spawn_item', 'god_hold_move']) expect(kinds).toContain(k);
    const replayed = replayTo(w.s, w.s.tick, (s) => new World(s), (p) => createWorldState(p));
    expect(stateHash(replayed.s)).toBe(stateHash(w.s));
  });

  it('nature powers and time skips replay identically (P3.8)', () => {
    const w = createWorld({ seed: 31 });
    const c = w.s.village.center;
    const casts: Command[] = [
      { type: 'god_cast', power: 'rain', pos: c, radius: 10 },
      { type: 'god_cast', power: 'warm_sun', pos: { x: c.x + 6, y: c.y }, radius: 8 },
      { type: 'god_cast', power: 'gust', pos: { x: c.x - 4, y: c.y }, to: { x: c.x + 6, y: c.y + 1 } },
      { type: 'god_cast', power: 'apple_shower', pos: c, radius: 4 },
      { type: 'god_cast', power: 'fast_forward', pos: { x: 0, y: 0 } },
      { type: 'god_cast', power: 'snowfall', pos: c, radius: 12 },
    ];
    for (let t = 0; t < 3000; t++) {
      if (t % 400 === 50 && casts.length) w.push(casts.shift()!);
      w.step();
    }
    expect(w.s.commandLog.filter((x) => x.cmd.type === 'god_cast').length).toBe(6);
    const replayed = replayTo(w.s, w.s.tick, (s) => new World(s), (p) => createWorldState(p));
    expect(stateHash(replayed.s)).toBe(stateHash(w.s));
  });
});
