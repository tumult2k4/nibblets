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
});
