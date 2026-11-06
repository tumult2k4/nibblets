import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { deserialize, serialize, stateHash } from '../save';
import { World } from '../world';
import type { RivalClan } from '../clans';
import { spawnVisitor, visitorsOf } from '../visitors';
import { updateAllies } from '../alliance';
import { inbreedMul } from '../goblin/family';
import { cloneGenome, heterozygosity, LOCUS_DEFS } from '../goblin/genetics/genome';
import { spawnBramblebeast } from '../enemies/bramblebeast';
import { DISCOVERABLE, knowers } from '../knowledge';
import { opinionOf } from '../goblin/social';
import { makeWorld, spawnGoblin } from './helpers';
import type { Goblin } from '../state';
import type { SimEvent } from '../../shared/types';

const A = CFG.alliance, DAY = CFG.time.dayTicks, HOUR = DAY / 24;

/** A quiet world on day `day` at `hour` (on a clan update), every clan met, the first one allied. */
function world(day = 8, hour = 10): { w: World; c: RivalClan } {
  const w = makeWorld({ size: 30 });
  w.s.tick = day * DAY + (hour - 6) * HOUR;
  w.clock = clockAt(w.s.tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = w.s.tick + 100 * DAY;
  w.s.threat.night = 1e9;
  for (const c of w.s.rivals) { c.contact = w.s.tick - DAY; c.contactAt = 0; c.nextTrader = 1e12; c.relation = 10; }
  const c = w.s.rivals[0]!;
  c.relation = 80; c.allied = true;
  return { w, c };
}
function run(w: World, n: number, until?: () => boolean): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    all.push(...w.step());
    if (until?.()) break;
  }
  return all;
}
/** Every locus the same allele twice: no heterozygosity at all. */
function homozygous(g: Goblin): void {
  const gen = cloneGenome(g.genome);
  for (const def of LOCUS_DEFS) gen[def.key] = { ...gen[def.key], b: gen[def.key].a };
  g.genome = gen;
}

describe('alliances and marriage migration (§16, P10.4)', () => {
  it('an ally sends a suitor who joins with its genes and recipes the village lacks, a match in mind', () => {
    const { w, c } = world();
    const single = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    single.personality.wanderlust = 0.9;
    const v = spawnVisitor(w, c, 'suitor')!;
    expect(v).toBeTruthy();
    const known = new Set(DISCOVERABLE.filter((id) => knowers(w.s, id)));
    const evs = run(w, 4 * HOUR, () => !visitorsOf(w.s).includes(v));
    const joined = evs.find((e) => e.type === 'goblin_joined');
    expect(joined?.type === 'goblin_joined' && joined.clanId === c.id).toBe(true);
    if (joined?.type !== 'goblin_joined') return;
    const g = w.goblin(joined.goblinId)!;
    expect(g.clanId).toBe(c.id);
    expect(g.genome).toEqual(v.genome);
    expect(w.s.clans.some((x) => x.id === c.id)).toBe(true);
    expect(w.s.lineage[g.id]).toBeTruthy();
    expect(joined.recipes.length).toBeGreaterThan(0);
    expect(joined.recipes.length).toBeLessThanOrEqual(A.recipes);
    for (const r of joined.recipes) { expect(g.knownRecipes).toContain(r); expect(known.has(r)).toBe(false); }
    expect(joined.matchId).toBe(single.id);
    expect(opinionOf(g, single.id)).toBeGreaterThanOrEqual(A.match);
    expect(opinionOf(single, g.id)).toBeGreaterThanOrEqual(A.match);
  });

  it("an ally's suitors come now and then on its 10:00 update, while the village has someone to marry", () => {
    const { w, c } = world();
    spawnGoblin(w, { pos: { x: 15, y: 15 } });
    let days = 0;
    for (; days < 30 && !visitorsOf(w.s).some((v) => v.kind === 'suitor'); days++) {
      updateAllies(w);
      w.s.tick += DAY;
    }
    expect(days).toBeLessThan(30);
    expect(c.nextSuitor).toBeGreaterThan(w.s.tick - DAY);
    // not when nobody is free to marry, nor from a clan that is not allied
    const q = world(), other = q.w.s.rivals[1]!;
    q.c.allied = false; q.c.relation = 40;
    other.relation = 10;
    for (let i = 0; i < 30; i++) { updateAllies(q.w); q.w.s.tick += DAY; }
    expect(visitorsOf(q.w.s).some((v) => v.kind === 'suitor')).toBe(false);
  });

  it('a restless unmated goblin may go to marry into an allied clan: it walks off and the clan warms', () => {
    const { w, c } = world();
    c.nextSuitor = 1e12;
    const g = spawnGoblin(w, { pos: { x: 15, y: 15 } });
    g.personality.wanderlust = 1;
    for (let i = 0; i < 400 && w.s.leaving?.[g.id] === undefined; i++) updateAllies(w);
    expect(w.s.leaving?.[g.id]).toBe(c.id);
    const pop = c.pop, rel = c.relation;
    const evs = run(w, 4 * HOUR, () => !w.goblin(g.id));
    expect(w.goblin(g.id)).toBeUndefined();
    expect(evs.some((e) => e.type === 'goblin_left' && e.goblinId === g.id && e.why === 'married' && e.clanId === c.id)).toBe(true);
    expect(c.pop).toBe(Math.min(CFG.clans.popCap, pop + 1));
    expect(c.relation).toBeGreaterThan(rel);
    expect(c.news.some((n) => n.kind === 'married')).toBe(true);
  });

  it('allies send warriors against a Bramblebeast near the village; they strike it, then go home', () => {
    const { w, c } = world(8, 14);
    const beast = spawnBramblebeast(w, { x: 4, y: 15 });
    const hp = beast.hp;
    for (let i = 0; i < 20 && !visitorsOf(w.s).some((v) => v.kind === 'warrior'); i++) {
      w.s.tick = Math.ceil((w.s.tick + 1) / CFG.clans.every) * CFG.clans.every;
      updateAllies(w);
    }
    const band = visitorsOf(w.s).filter((v) => v.kind === 'warrior');
    expect(band.length).toBeGreaterThanOrEqual(A.helpers[0]);
    expect(band.every((v) => v.clanId === c.id && v.targetId === beast.id)).toBe(true);
    run(w, 3 * HOUR, () => beast.hp < hp || !w.s.enemies.includes(beast));
    expect(beast.hp < hp || !w.s.enemies.includes(beast)).toBe(true);
    w.s.enemies = w.s.enemies.filter((e) => e !== beast);
    run(w, 3 * HOUR, () => !visitorsOf(w.s).some((v) => v.kind === 'warrior'));
    expect(visitorsOf(w.s).some((v) => v.kind === 'warrior')).toBe(false);
  });

  it('a pair with few different alleles lays less often: the inbreeding penalty', () => {
    const { w } = world();
    const a = spawnGoblin(w), b = spawnGoblin(w);
    expect(heterozygosity(a.genome)).toBeGreaterThan(A.inbreeding.below);
    const free = inbreedMul(a, b);
    homozygous(a); homozygous(b);
    expect(heterozygosity(a.genome)).toBe(0);
    expect(free).toBe(1);
    expect(inbreedMul(a, b)).toBeCloseTo(A.inbreeding.floor, 5);
  });

  it('suitors and warriors are deterministic and survive a save on the way', () => {
    const make = (): World => {
      const { w, c } = world(8, 14);
      spawnGoblin(w, { pos: { x: 15, y: 15 } });
      spawnVisitor(w, c, 'suitor');
      const beast = spawnBramblebeast(w, { x: 4, y: 15 });
      for (const v of [spawnVisitor(w, c, 'warrior'), spawnVisitor(w, c, 'warrior')]) if (v) { v.targetId = beast.id; v.leaveAt = w.s.tick + DAY; }
      return w;
    };
    const a = make(), b = make();
    run(a, 300); run(b, 300);
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    const c = new World(deserialize(serialize(a.s)));
    run(a, 900); run(c, 900);
    expect(stateHash(c.s)).toBe(stateHash(a.s));
  });
});
