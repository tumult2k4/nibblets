import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { killGoblin } from '../goblin/needs';
import { relate } from '../goblin/social';
import { updateMood } from '../goblin/mood';
import { deepestGrief, graveOf, griefId, isGrieving, updateDeath } from '../death';
import { BuryDead, Mourn } from '../ai/actions/burial';
import { giveTrinket } from '../trinkets';
import { findSite } from '../buildings';
import { deserialize, serialize } from '../save';
import { dist } from '../../shared/math';
import { makeWorld, spawnGoblin } from './helpers';
import type { UtilityAction } from '../ai/action';
import type { Goblin } from '../state';
import type { World } from '../world';
import type { SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, D = CFG.death;

function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function run(w: World, g: Goblin, a: UtilityAction, max = 4000): string {
  g.activity = { action: a.id, status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
  if (!a.start(g, w)) return 'failed';
  for (let i = 0; i < max; i++) {
    const r = a.step(g, w);
    w.s.tick++;
    w.bus.flush();
    if (r !== 'running') return r;
  }
  return 'timeout';
}
const grief = (g: Goblin, deadId: number) => g.mood.modifiers.find((m) => m.id === griefId(deadId));

describe('Grief, burial and mourning (P6.4, §13.7)', () => {
  it('those close to the dead grieve, by how close; strangers do not', () => {
    const w = makeWorld({ size: 40 });
    const dead = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    const mate = spawnGoblin(w, { pos: { x: 22, y: 20 } }), friend = spawnGoblin(w, { pos: { x: 18, y: 20 } }), pal = spawnGoblin(w, { pos: { x: 20, y: 23 } });
    const stranger = spawnGoblin(w, { pos: { x: 20, y: 17 } });
    Object.assign(relate(mate, dead.id), { opinion: 60, bond: 'mate' });
    relate(friend, dead.id).opinion = 90;
    relate(pal, dead.id).opinion = 40;
    relate(stranger, dead.id).opinion = 20;
    const evs = events(w);
    killGoblin(w, dead, 'fall');
    w.bus.flush();
    expect(grief(mate, dead.id)!.amount).toBeCloseTo(-D.griefMood[1], 5);
    expect(grief(friend, dead.id)!.amount).toBeLessThan(grief(pal, dead.id)!.amount);
    expect(grief(pal, dead.id)!.amount).toBeLessThan(-D.griefMood[0] + 0.01);
    expect(grief(stranger, dead.id)).toBeUndefined();
    expect(grief(mate, dead.id)!.expiresTick - w.s.tick).toBe(D.griefDays[1] * DAY);
    expect(evs.filter((e) => e.type === 'grief').length).toBe(3);
    w.s.tick += 10 - (w.s.tick % 10);
    updateMood(w);
    expect(mate.mood.emotion).toBe('grieving');
    expect(isGrieving(stranger)).toBe(false);
    expect(deepestGrief(friend)?.deadId).toBe(dead.id);
  });

  it('a friend carries the body to the graveyard and buries it, with its most precious trinket', () => {
    const w = makeWorld({ size: 40 });
    const dead = spawnGoblin(w, { pos: { x: 26, y: 20 } });
    giveTrinket(w, dead, 'common');
    const rare = giveTrinket(w, dead, 'rare');
    const friend = spawnGoblin(w, { pos: { x: 20, y: 20 } }), by = spawnGoblin(w, { pos: { x: 21, y: 21 } });
    relate(friend, dead.id).opinion = 80;
    relate(by, dead.id).opinion = 60;
    killGoblin(w, dead, 'combat');
    const gr = graveOf(w, dead.id)!;
    expect(gr).toMatchObject({ state: 'lying', goods: rare.id, born: dead.bornTick });
    expect(gr.body?.id).toBe(dead.id);
    expect(BuryDead.isAvailable(friend, w)).toBe(true);
    expect(BuryDead.score(friend, w)).toBeGreaterThan(BuryDead.score(by, w) - 0.2);
    const before = grief(by, dead.id)!.amount;
    by.pos = { x: 0, y: 0 }; // `by` will walk over; for now it is far off
    const evs = events(w);
    // halfway there it is carrying the body
    friend.activity = { action: 'bury_dead', status: 'running', startedTick: w.s.tick, targetId: null, target: null, path: [], progress: 0, stage: 0 };
    expect(BuryDead.start(friend, w)).toBe(true);
    let carried = false;
    for (let i = 0; i < 4000 && gr.state !== 'buried'; i++) {
      if (BuryDead.step(friend, w) !== 'running') break;
      if (gr.state === 'carried') { carried = true; by.pos = { ...friend.pos }; }
      w.s.tick++;
    }
    w.bus.flush();
    expect(carried).toBe(true);
    expect(gr.state).toBe('buried');
    const yard = w.s.village.graveyard!;
    expect(dist(yard, w.s.village.center)).toBeGreaterThanOrEqual(D.graveyard[0]);
    expect(dist(gr.pos, yard)).toBeLessThan(3);
    expect(evs.some((e) => e.type === 'buried' && e.byId === friend.id && e.mourners >= 1)).toBe(true);
    expect(grief(by, dead.id)!.amount).toBeGreaterThan(before); // standing by at the burial eased it
    // nothing gets built on the graveyard
    const site = findSite(w, 'hut', yard);
    expect(!site || dist(site, yard) > D.keepClear).toBe(true);
  });

  it('a second burial takes the next place in the row', () => {
    const w = makeWorld({ size: 40 });
    const a = spawnGoblin(w, { pos: { x: 22, y: 20 } }), b = spawnGoblin(w, { pos: { x: 23, y: 21 } });
    const digger = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    killGoblin(w, a, 'fall');
    killGoblin(w, b, 'fall');
    expect(run(w, digger, BuryDead)).toBe('done');
    expect(run(w, digger, BuryDead)).toBe('done');
    const [g1, g2] = [graveOf(w, a.id)!, graveOf(w, b.id)!];
    expect(g1.state).toBe('buried');
    expect(g2.state).toBe('buried');
    expect(dist(g1.pos, g2.pos)).toBeCloseTo(D.gap, 1);
  });

  it('a body nobody comes for is covered where it lies; the body for Resurrect is kept two days', () => {
    const w = makeWorld({ size: 40 });
    const dead = spawnGoblin(w, { pos: { x: 26, y: 20 } });
    killGoblin(w, dead, 'fall');
    const gr = graveOf(w, dead.id)!;
    const at = { ...gr.pos };
    const evs = events(w);
    for (let h = 0; h < (D.leaveDays + 0.5) * 24; h++) { w.s.tick += HOUR - (w.s.tick % HOUR); updateDeath(w); }
    w.bus.flush();
    expect(gr.state).toBe('mound');
    expect(gr.pos).toEqual(at);
    expect(gr.body).toBeNull();
    expect(evs.some((e) => e.type === 'buried' && e.byId === null)).toBe(true);
  });

  it('the grieving visit the grave, and it eases their grief; once a day', () => {
    const w = makeWorld({ size: 40 });
    const dead = spawnGoblin(w, { pos: { x: 26, y: 20 } });
    const mate = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    Object.assign(relate(mate, dead.id), { opinion: 70, bond: 'mate' });
    killGoblin(w, dead, 'old_age');
    graveOf(w, dead.id)!.state = 'mound';
    const m = grief(mate, dead.id)!;
    const a0 = m.amount, left0 = m.expiresTick - w.s.tick;
    expect(Mourn.isAvailable(mate, w)).toBe(true);
    expect(Mourn.score(mate, w)).toBeGreaterThan(0.5);
    const evs = events(w);
    expect(run(w, mate, Mourn)).toBe('done');
    expect(evs.some((e) => e.type === 'mourned' && e.goblinId === mate.id)).toBe(true);
    expect(m.amount).toBeCloseTo(a0 * D.mournEase, 3);
    expect(m.expiresTick - w.s.tick).toBeLessThan(left0 * D.mournShorten + 1);
    expect(Mourn.isAvailable(mate, w)).toBe(false); // not again today
  });

  it('survives a save and load with a body being carried; old graves become mounds', () => {
    const w = makeWorld({ size: 40 });
    const dead = spawnGoblin(w, { pos: { x: 26, y: 20 } });
    killGoblin(w, dead, 'fall');
    const back = deserialize(serialize(w.s));
    expect(back.graves[0]).toMatchObject({ state: 'lying', goblinId: dead.id });
    expect(back.graves[0]!.body?.name).toBe(dead.name);
    const raw = JSON.parse(serialize(w.s)) as { version: number; graves: Record<string, unknown>[] };
    raw.version = 18;
    raw.graves = [{ id: 99, goblinId: 5, name: 'Old Grub', pos: { x: 3, y: 3 }, tick: 100, cause: 'fall' }];
    const old = deserialize(JSON.stringify(raw));
    expect(old.graves[0]).toMatchObject({ state: 'mound', body: null, goods: null });
  });
});
