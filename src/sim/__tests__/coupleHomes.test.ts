import { describe, expect, it } from 'vitest';
import { becomeMates, registerLineage } from '../goblin/family';
import { completeBuilding, placeBlueprint } from '../buildings';
import { claim, ClaimHome } from '../ai/actions/home';
import { makeWorld, spawnGoblin } from './helpers';
import type { Goblin } from '../state';
import type { World } from '../world';

/** Run ClaimHome for `g` to its end. */
function claimHome(w: World, g: Goblin): string {
  g.activity = { action: ClaimHome.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!ClaimHome.start(g, w)) return 'failed';
  for (let i = 0; i < 3000; i++) {
    const r = ClaimHome.step(g, w);
    w.bus.flush();
    w.s.tick++;
    if (r !== 'running') return r;
  }
  return 'timeout';
}
const hutAt = (w: World, x: number, y: number) => {
  const h = placeBlueprint(w, 'hut', { x, y }, null);
  completeBuilding(w, h, null);
  return h;
};

describe('Homes for couples (Phase 5 balance)', () => {
  it('two homeless mates move into one hut together', () => {
    const w = makeWorld();
    const a = spawnGoblin(w, { pos: { x: 12, y: 12 } }), b = spawnGoblin(w, { pos: { x: 13, y: 12 } });
    for (const g of [a, b]) { registerLineage(w.s, g); g.homeId = null; }
    for (const h of w.s.buildings) h.occupants = [];
    const hut = hutAt(w, 16, 16);
    becomeMates(w, a, b);
    expect(ClaimHome.isAvailable(a, w)).toBe(true);
    expect(claimHome(w, a)).toBe('done');
    expect(a.homeId).toBe(hut.id);
    expect(b.homeId).toBe(hut.id);
    expect(hut.occupants).toEqual([a.id, b.id]);
    expect(ClaimHome.isAvailable(b, w)).toBe(false);
  });

  it('mates living apart in full huts leave them for one with room for both', () => {
    const w = makeWorld();
    const [a, b, x, y] = [0, 1, 2, 3].map((i) => spawnGoblin(w, { pos: { x: 12 + i, y: 12 } })) as [Goblin, Goblin, Goblin, Goblin];
    for (const g of [a, b, x, y]) { registerLineage(w.s, g); g.homeId = null; }
    for (const h of w.s.buildings) h.occupants = [];
    const h1 = hutAt(w, 16, 16), h2 = hutAt(w, 20, 16), h3 = hutAt(w, 16, 20);
    claim(w, a, h1); claim(w, x, h1);
    claim(w, b, h2); claim(w, y, h2);
    becomeMates(w, a, b); // no room anywhere: they stay where they are for now
    expect(a.homeId).not.toBe(b.homeId);
    expect(ClaimHome.isAvailable(a, w)).toBe(true);
    expect(claimHome(w, a)).toBe('done');
    expect([a.homeId, b.homeId]).toEqual([h3.id, h3.id]);
    expect(h1.occupants).toEqual([x.id]);
    expect(h2.occupants).toEqual([y.id]);
  });

  it('of a couple apart where one hut has room, only the other one moves', () => {
    const w = makeWorld();
    const [a, b, x] = [0, 1, 2].map((i) => spawnGoblin(w, { pos: { x: 12 + i, y: 12 } })) as [Goblin, Goblin, Goblin];
    for (const g of [a, b, x]) { registerLineage(w.s, g); g.homeId = null; }
    for (const h of w.s.buildings) h.occupants = [];
    const h1 = hutAt(w, 16, 16), h2 = hutAt(w, 20, 16);
    claim(w, a, h1);
    claim(w, b, h2); claim(w, x, h2);
    becomeMates(w, a, b); // a's hut has room: b already moved in
    expect(b.homeId).toBe(h1.id);
    // apart again (say b was pushed out): b goes to a, not the other way round
    h1.occupants = [a.id]; h2.occupants.push(b.id); b.homeId = h2.id;
    expect(ClaimHome.isAvailable(a, w)).toBe(false);
    expect(ClaimHome.isAvailable(b, w)).toBe(true);
    expect(claimHome(w, b)).toBe('done');
    expect(h1.occupants).toEqual([a.id, b.id]);
    expect(h2.occupants).toEqual([x.id]);
  });
});
