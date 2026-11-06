import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { clockAt } from '../time';
import { setWeather } from '../weather';
import { completeBuilding, placeBlueprint } from '../buildings';
import { birthFaith } from '../goblin/goblin';
import { updateDevotion, godTemper } from '../god/devotion';
import { addFavor, maxFavor, updateFavor } from '../god/favor';
import { divineAct } from '../god/faith';
import { tellOfGod } from '../god/news';
import { askFor, offerPrayer, openPrayer, updatePrayers } from '../god/prayers';
import { faithOf } from '../god/faithState';
import { giveTrinket } from '../trinkets';
import { layOffering, consecrated, offer } from '../shrine';
import { makeWorld, spawnGoblin } from './helpers';
import type { Building, Goblin } from '../state';
import type { World } from '../world';
import type { BuildingType, SimEvent } from '../../shared/types';

const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, FA = CFG.faith, G = CFG.god;

function at(w: World, tick: number): void {
  w.s.tick = tick;
  w.clock = clockAt(tick);
  setWeather(w, 'clear');
  w.s.weather.nextChangeTick = tick + 100 * DAY;
}
function events(w: World): SimEvent[] {
  const evs: SimEvent[] = [];
  w.bus.subscribe((e) => evs.push(e));
  return evs;
}
function station(w: World, type: BuildingType, x: number, y: number): Building {
  const b = placeBlueprint(w, type, { x, y }, null);
  completeBuilding(w, b, null);
  return b;
}
/** Run the daily round for `g` (its hour of the day). */
function dayFor(w: World, g: Goblin): void {
  let t = w.s.tick + 1;
  while (t % HOUR !== 0 || Math.floor(t / HOUR) % 24 !== g.id % 24) t++;
  at(w, t);
  updateDevotion(w);
}

describe('faith system (§17.4, P8.8)', () => {
  it('birth faith follows piety and the parents; a youngling drifts toward its parents; faith fades without the god', () => {
    const w = makeWorld({ size: 30 });
    const a = spawnGoblin(w), b = spawnGoblin(w);
    a.godView.faith = 80;
    b.godView.faith = 60;
    expect(birthFaith(w.s, 0.5, null)).toBeCloseTo(FA.birth.base + 0.5 * FA.birth.piety, 4);
    expect(birthFaith(w.s, 0.5, [a.id, b.id])).toBeCloseTo(FA.birth.base + 0.5 * FA.birth.piety + FA.birth.parents * 70, 4);
    const c = spawnGoblin(w, { ageDays: 5 });
    c.parents = [a.id, b.id];
    c.lifeStage = 'youngling';
    c.godView.faith = 30;
    at(w, 2 * DAY);
    a.godView.seenTick = b.godView.seenTick = c.godView.seenTick = w.s.tick; // the god was about: no fading today
    dayFor(w, c);
    expect(c.godView.faith).toBeCloseTo(30 + FA.birth.nurture, 4);
    // a day and more without a sign: −1, never below piety × 20
    const d = spawnGoblin(w);
    d.personality.piety = 0.5;
    d.godView.faith = 10.5;
    d.godView.love = 50;
    d.godView.fear = 5;
    dayFor(w, d);
    dayFor(w, d);
    expect(d.godView.faith).toBe(10);
    expect(d.godView.love).toBe(48);
    expect(d.godView.fear).toBe(7);
    d.godView.faith = 40;
    divineAct(w, 'gift', d.pos);
    dayFor(w, d);
    expect(d.godView.faith).toBe(40 + 4); // seen today: kept (the gift's +4)
  });

  it('word of the god: a witness tells one who was not there (half the effect, more from a fibber); a kindness may convert a skeptic', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY + DAY / 3);
    const g = spawnGoblin(w, { pos: { x: 10, y: 10 } }), o = spawnGoblin(w, { pos: { x: 35, y: 35 } });
    g.godView.faith = o.godView.faith = 40;
    divineAct(w, 'lightning', { x: 11, y: 10 }, undefined, false);
    expect(g.godView.faith).toBe(48);
    expect(o.godView.faith).toBe(40); // too far to see it
    g.personality.mischief = 0;
    expect(tellOfGod(w, g, o)).toBe(true);
    expect(o.godView.faith).toBeCloseTo(40 + 8 * G.gossipFactor, 4);
    expect(o.godView.fear).toBeCloseTo(10 + 15 * G.gossipFactor, 4);
    expect(tellOfGod(w, g, o)).toBe(false); // it knows now
    const liar = spawnGoblin(w, { pos: { x: 10, y: 11 } }), p = spawnGoblin(w, { pos: { x: 36, y: 36 } });
    liar.personality.mischief = 0.9;
    liar.godView.faith = p.godView.faith = 40;
    divineAct(w, 'lightning', { x: 11, y: 11 }, undefined, false);
    tellOfGod(w, liar, p);
    expect(p.godView.faith).toBeCloseTo(40 + 8 * G.gossipFactor * (1 + FA.news.exaggerate), 4);
    // skeptics: no faith from a kindness, but a blessing on one converts it now and then
    const evs = events(w);
    const sk = Array.from({ length: 40 }, (_, i) => spawnGoblin(w, { pos: { x: 20 + (i % 8), y: 20 + Math.floor(i / 8) } }));
    for (const s of sk) { s.godView.faith = 5; divineAct(w, 'blessing', s.pos, s.id, false); }
    w.bus.flush();
    const won = sk.filter((s) => s.godView.faith >= 5 + FA.convert.faith).length;
    expect(won).toBeGreaterThan(3);
    expect(won).toBeLessThan(25);
    expect(evs.filter((e) => e.type === 'converted').length).toBe(won);
    expect(sk.filter((s) => s.godView.faith > 5 && s.godView.faith < 30).length).toBe(0);
  });

  it('favor: faith earns it hourly, capped by believers; offerings are taken a day later; Starfall honors the god', () => {
    const w = makeWorld({ size: 30 });
    const gs = Array.from({ length: 4 }, () => spawnGoblin(w));
    for (const g of gs) { g.godView.faith = 50; g.personality.piety = 0.5; }
    w.s.god.favor = 0;
    at(w, 2 * DAY);
    updateFavor(w);
    expect(w.s.god.favor).toBeCloseTo(4 * 0.5 * 1 * HOUR / DAY, 4);
    expect(maxFavor(w)).toBe(G.maxFavorBase + 4 * G.maxFavorPerBeliever);
    addFavor(w, 1000, 'answered');
    expect(w.s.god.favor).toBe(maxFavor(w));
    w.s.god.favor = 0;
    const sh = station(w, 'shrine', 12, 12);
    const t = giveTrinket(w, gs[0]!, 'common');
    layOffering(w, gs[0]!, sh, { trinketId: t.id });
    expect(sh.decoration).toContain(t.id); // the first: it dresses the shrine and stays
    const t2 = giveTrinket(w, gs[0]!, 'common');
    layOffering(w, gs[0]!, sh, { trinketId: t2.id });
    layOffering(w, gs[1]!, sh, { item: 'apple' });
    expect(faithOf(w.s).offerings.length).toBe(2);
    for (const g of gs) g.godView.faith = 0;
    at(w, 3 * DAY + HOUR);
    updateFavor(w);
    expect(w.s.god.favor).toBeCloseTo(CFG.trinkets.value.common * G.offeringTrinketMul + 2 * G.offeringFoodMul, 4);
    expect(sh.decoration).toEqual([t.id]);
    expect(w.s.trinkets.some((x) => x.id === t2.id)).toBe(false);
    expect(faithOf(w.s).offerings.length).toBe(0);
  });

  it('prayers ask for what is needed, are answered by a fitting act nearby, or fade after a day', () => {
    const w = makeWorld({ size: 40 });
    at(w, 2 * DAY + DAY / 3);
    const evs = events(w);
    const g = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    g.godView.faith = 50;
    g.needs.hunger = 20;
    expect(askFor(g, w).kind).toBe('food');
    g.needs.hunger = 90;
    w.s.climate.drought = { since: w.s.tick, tiles: [] };
    expect(askFor(g, w).kind).toBe('rain');
    const p = offerPrayer(w, g, false)!;
    expect(p.kind).toBe('rain');
    expect(offerPrayer(w, g, false)).toBeNull(); // one at a time
    w.s.god.favor = 0;
    w.push({ type: 'god_cast', power: 'rain', pos: { x: 26, y: 20 }, radius: 4 });
    w.step();
    expect(openPrayer(g, w)).toBeUndefined();
    expect(g.godView.answeredPrayers).toBe(1);
    expect(g.godView.faith).toBeGreaterThanOrEqual(50 + FA.prayer.answered.faith);
    expect(w.s.god.favor).toBeGreaterThanOrEqual(G.answeredPrayerFavor);
    expect(evs.some((e) => e.type === 'prayer_answered' && e.goblinId === g.id && e.kind === 'rain')).toBe(true);
    // unanswered: a little faith lost after a day; thanks just close
    w.s.climate.drought = null;
    const o = spawnGoblin(w, { pos: { x: 10, y: 10 } });
    o.needs.thirst = 10;
    o.godView.faith = 50;
    expect(offerPrayer(w, o, true)!.kind).toBe('water');
    const thanks = spawnGoblin(w, { pos: { x: 12, y: 10 } });
    thanks.lifeStage = 'elder';
    thanks.godView.faith = 50;
    expect(offerPrayer(w, thanks, false)!.kind).toBe('thanks');
    at(w, w.s.tick + G.prayerTicks + HOUR - (w.s.tick % HOUR));
    updatePrayers(w);
    w.bus.flush();
    expect(o.godView.faith).toBe(50 + FA.prayer.ignored.faith);
    expect(o.godView.ignoredPrayers).toBe(1);
    expect(thanks.godView.faith).toBe(50);
    expect(faithOf(w.s).prayers.length).toBe(0);
  });

  it('a kind god cheers the village; a wrathful one keeps it afraid; leaning on food from the sky saps industry', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w);
    at(w, 2 * DAY);
    w.s.god.alignment = 60;
    expect(godTemper(w.s)).toBe('kind');
    dayFor(w, g);
    expect(g.mood.modifiers.find((m) => m.id === 'god_kind')?.amount).toBe(FA.alignment.mood);
    w.s.god.alignment = -60;
    g.godView.fear = 10;
    dayFor(w, g);
    expect(g.godView.fear).toBe(11);
    expect(g.mood.modifiers.find((m) => m.id === 'god_wrathful')?.amount).toBe(-FA.alignment.mood);
    w.s.god.alignment = 0;
    const ind = g.personality.industry;
    for (let i = 0; i < FA.alignment.minEaten; i++) w.emit({ type: 'item_eaten', goblinId: g.id, item: 'apple', divine: i % 2 === 0 });
    dayFor(w, g);
    expect(g.personality.industry).toBeCloseTo(Math.max(0, ind - 0.002), 4);
  });

  it('the temple is consecrated by two trinkets; offerings beyond the dressing are the god\'s', () => {
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w);
    const te = station(w, 'temple', 15, 15);
    expect(consecrated(te)).toBe(false);
    giveTrinket(w, g, 'common');
    expect(offer(w, g, te)).toBe(true);
    giveTrinket(w, g, 'uncommon');
    expect(offer(w, g, te)).toBe(true);
    expect(consecrated(te)).toBe(true);
    expect(faithOf(w.s).offerings.length).toBe(0);
  });
});
