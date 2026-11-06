import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { deserialize, serialize, stateHash } from '../save';
import { World } from '../world';
import { spawnGroundItem } from '../groundItems';
import { recordHistory } from '../history';
import { spawnEnemy } from '../enemies/director';
import type { SandboxOp } from '../sandbox';
import { makeWorld, runTicks, spawnGoblin } from './helpers';
import type { SimEvent } from '../../shared/types';

const op = (w: World, o: SandboxOp): SimEvent[] => {
  w.push({ type: 'sandbox', op: o });
  return w.step();
};
const near = (a: { x: number; y: number }, b: { x: number; y: number }, r = 1.2) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

describe('Possess (Sandbox, P11.1)', () => {
  it('a possessed goblin stops thinking for itself, walks where it is sent and picks up what it is pointed at', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    op(w, { op: 'possess', goblinId: g.id });
    expect(w.s.god.possessedId).toBe(g.id);
    runTicks(w, 200);
    expect(g.activity.status).not.toBe('running'); // it waits for the player
    op(w, { op: 'possessed_act', act: 'walk', pos: { x: 18, y: 12 } });
    runTicks(w, 300, () => g.activity.status !== 'running');
    expect(near(g.pos, { x: 18, y: 12 })).toBe(true);
    const it = spawnGroundItem(w, { type: 'flint', qty: 1 }, { x: 14, y: 16 });
    op(w, { op: 'possessed_act', act: 'pick_up', pos: it.pos, targetId: it.id });
    runTicks(w, 400, () => g.activity.status !== 'running');
    expect(g.inventory.some((s) => s.type === 'flint')).toBe(true);
  });

  it('let go, it remembers being possessed and feels it was not itself; nobody can be told what to do then', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    op(w, { op: 'possess', goblinId: g.id });
    op(w, { op: 'possess', goblinId: null });
    expect(w.s.god.possessedId).toBeNull();
    expect(g.memory.some((m) => m.kind === 'possessed')).toBe(true);
    expect(g.mood.modifiers.some((m) => m.id === 'not_myself' && m.amount === CFG.possess.mood)).toBe(true);
    const evs = op(w, { op: 'possessed_act', act: 'walk', pos: { x: 5, y: 5 } });
    expect(evs.some((e) => e.type === 'command_rejected')).toBe(true);
  });

  it('possession replays: the same commands give the same world, and it survives a save', () => {
    const make = (): World => {
      const w = makeWorld({ size: 30, seed: 4 });
      const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
      spawnGoblin(w, { pos: { x: 12, y: 10 } });
      op(w, { op: 'possess', goblinId: g.id });
      op(w, { op: 'possessed_act', act: 'walk', pos: { x: 20, y: 18 } });
      return w;
    };
    const a = make(), b = make();
    runTicks(a, 150); runTicks(b, 150);
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    const c = new World(deserialize(serialize(a.s)));
    runTicks(a, 300); runTicks(c, 300);
    expect(stateHash(c.s)).toBe(stateHash(a.s));
    expect(c.s.god.possessedId).toBe(a.s.god.possessedId);
  });
});

describe('the village history (Timeline, P11.1)', () => {
  it('keeps a marker for what matters, by kind, with who and where; not for every fence post', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    const at = { x: 3, y: 4 }, tick = w.s.tick;
    recordHistory(w.s, [
      { type: 'egg_hatched', eggId: 1, goblinId: g.id, tick, at },
      { type: 'goblin_died', goblinId: g.id, cause: 'old_age', tick },
      { type: 'building_completed', buildingId: 5, kind: 'hut', goblinId: g.id, tick, at },
      { type: 'building_completed', buildingId: 6, kind: 'fence', tick, at },
      { type: 'festival', kind: 'sun_feast', phase: 'start', tick, at },
      { type: 'festival', kind: 'sun_feast', phase: 'end', tick, at },
      { type: 'divine_act', act: 'rain', witnessIds: [], tick, at },
      { type: 'divine_act', act: 'pet', targetId: g.id, witnessIds: [], tick, at },
    ] as SimEvent[]);
    const h = w.s.history!.events;
    expect(h.map((x) => x.cat)).toEqual(['birth', 'death', 'building', 'festival', 'divine']);
    expect(h[0]).toMatchObject({ e: 'egg_hatched', id: g.id, at, tick });
    expect(h[2]!.k).toBe('hut');
    expect(h[4]!.k).toBe('rain');
  });

  it('remembers every kind of creature met, is filled by the tick itself, and is kept in the save', () => {
    const w = makeWorld({ size: 30 });
    spawnGoblin(w, { pos: { x: 10, y: 10 } });
    spawnEnemy(w, 'gnasher', { x: 13, y: 10 });
    runTicks(w, 5); // it comes onto the land
    expect(w.s.history?.seen).toContain('gnasher');
    const c = new World(deserialize(serialize(w.s)));
    expect(c.s.history).toEqual(w.s.history);
  });
});
