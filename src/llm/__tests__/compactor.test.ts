import { describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { CFG } from '../../sim/config';
import { placesOf } from '../../sim/places';
import { EventLog } from '../eventLog';
import { compactDay, topOfDay } from '../eventCompactor';
import { colorWord, goblinContext, sizeWord } from '../describe';
import { placeName } from '../placeNames';
import { registerLineage } from '../../sim/goblin/family';
import type { World } from '../../sim/world';
import type { SimEventInput } from '../../shared/types';

const HOUR = CFG.time.dayTicks / 24;

/** Emit at a clock hour (06:00 or later) of day 0 and record into `log`, as the app does after each step. */
function at(w: World, log: EventLog, hour: number, e: SimEventInput): void {
  w.s.tick = Math.round((hour - 6) * HOUR);
  w.emit(e);
  log.record(w.bus.flush(), w.s);
}

function scene() {
  const w = makeWorld({ size: 40 });
  const me = spawnGoblin(w, { pos: { x: 20, y: 20 } });
  const pal = spawnGoblin(w, { pos: { x: 21, y: 20 } });
  const far = spawnGoblin(w, { pos: { x: 38, y: 38 } });
  for (const g of [me, pal, far]) registerLineage(w.s, g);
  me.relationships.push({ targetId: pal.id, opinion: 60, familiarity: 50, bond: 'friend', lastInteraction: 0 });
  const log = new EventLog();
  for (let i = 0; i < 4; i++) at(w, log, 7 + i * 0.2, { type: 'harvested', goblinId: me.id, plantId: 1, item: 'apple' });
  at(w, log, 9, { type: 'gift_given', fromId: pal.id, toId: me.id, item: 'apple' });
  at(w, log, 19, { type: 'enemy_killed', enemyId: 99, kind: 'gnasher', killerId: me.id, at: { x: 20, y: 21 } });
  w.s.goblins = w.s.goblins.filter((g) => g.id !== pal.id);
  at(w, log, 20, { type: 'goblin_died', goblinId: pal.id, cause: 'combat', at: { x: 20, y: 21 } });
  return { w, log, me, pal, far };
}

describe('event compactor (§19.3, P9.2)', () => {
  it("one goblin's day: names, I and me, merged repeats, time of day, the place it happened", () => {
    const { w, log, me, pal } = scene();
    const place = placeName(placesOf(w.s)[0]!, 'en');
    const en = compactDay(w.s, log, me, 0, 'en');
    expect(en.lines).toEqual([
      'dawn — I picked apple ×4',
      `morning — ${pal.name} gave me apple`,
      `dusk — I slew a Gnasher at ${place}`,
      `dusk — the village named ${place}`,
      `dusk — ${pal.name} died (killed in a fight) at ${place}`,
    ]);
    const de = compactDay(w.s, log, me, 0, 'de');
    expect(de.lines[0]).toBe('früh — ich pflückte Apfel ×4');
    expect(de.lines[1]).toBe(`morgens — ${pal.name} schenkte mir Apfel`);
    expect(de.lines[2]).toBe(`abends — ich erlegte einen Knirscher bei ${placeName(placesOf(w.s)[0]!, 'de')}`);
  });

  it('a friend dying weighs most; a bystander sees less and rates it lower; far away sees nothing', () => {
    const { w, log, me, far } = scene();
    const mine = compactDay(w.s, log, me, 0, 'en');
    const farDay = compactDay(w.s, log, far, 0, 'en');
    expect(farDay.lines).toEqual([]);
    const stranger = spawnGoblin(w, { pos: { x: 22, y: 22 } });
    at(w, log, 21, { type: 'injured', goblinId: me.id, injury: 'limp' });
    const seen = compactDay(w.s, log, stranger, 0, 'en');
    expect(seen.lines).toHaveLength(1);
    expect(seen.lines[0]).toMatch(new RegExp(`^night — ${me.name} was hurt`));
    expect(seen.score).toBeCloseTo(7 * 0.6);
    expect(mine.score).toBeGreaterThan(12 + 9);
    expect(topOfDay(w.s, log, 0, 1, 'en')[0]!.goblinId).toBe(me.id);
  });

  it('keeps the best eight lines, in the order they happened', () => {
    const w = makeWorld({ size: 40 });
    const me = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    const others = Array.from({ length: 10 }, (_, i) => spawnGoblin(w, { pos: { x: 21 + (i % 3), y: 19 + Math.floor(i / 3) } }));
    const log = new EventLog();
    others.forEach((o, i) => at(w, log, 6 + i, { type: 'chat', aId: me.id, bId: o.id, topic: 'weather' }));
    at(w, log, 17, { type: 'brawl', aId: me.id, bId: others[0]!.id, at: { x: 20, y: 20 } });
    const day = compactDay(w.s, log, me, 0, 'en');
    expect(day.lines).toHaveLength(8);
    expect(day.lines[day.lines.length - 1]).toMatch(/came to blows/);
    const hours = day.lines.map((l) => l.split(' — ')[0]);
    expect(hours[0]).toBe('dawn');
  });

  it('words for a goblin: color, size, and the context header in both languages', () => {
    expect(colorWord(100, 0.45, 'en')).toBe('mossy green');
    expect(colorWord(100, 0.2, 'en')).toBe('dark mossy green');
    expect(colorWord(100, 0.8, 'de')).toBe('blassmoosgrün');
    expect(colorWord(355, 0.5, 'en')).toBe('brick red');
    expect(sizeWord(0.85, 'en')).toBe('small');
    expect(sizeWord(1.2, 'de')).toBe('groß');
    const w = makeWorld({ size: 30 });
    const g = spawnGoblin(w);
    for (const lang of ['en', 'de'] as const) {
      const c = goblinContext(w.s, g, lang);
      expect(c.name).toBe(g.name);
      expect(c.colorWord.length).toBeGreaterThan(2);
      expect(c.season.length).toBeGreaterThan(2);
      expect(JSON.stringify(c)).not.toMatch(/(cx|need|season|weather|emotion|stage)\.[a-z]/);
    }
  });

  it('trade and strangers (P10.2): the clan by its name, goods with their count', () => {
    const w = makeWorld({ size: 40 });
    const me = spawnGoblin(w, { pos: { x: 20, y: 20 } }), pal = spawnGoblin(w, { pos: { x: 21, y: 20 } });
    for (const g of [me, pal]) registerLineage(w.s, g);
    const log = new EventLog(), clan = w.s.rivals[0]!;
    at(w, log, 9, { type: 'visitor_arrived', visitorId: 900, clanId: clan.id, kind: 'trader', at: { x: 21, y: 21 } });
    at(w, log, 10, { type: 'traded', goblinId: me.id, visitorId: 900, clanId: clan.id, gave: { type: 'apple', qty: 2 }, got: { type: 'flint', qty: 3 } });
    at(w, log, 15, { type: 'traded', goblinId: pal.id, withId: me.id, gave: { trinket: 'crystal' }, got: { type: 'apple', qty: 4 } });
    expect(compactDay(w.s, log, me, 0, 'en').lines).toEqual([
      `morning — a trader of the ${clan.name} clan came`,
      `morning — I traded apple ×2 for flint ×3 with the ${clan.name} clan`,
      `afternoon — ${pal.name} swapped crystal with me for apple ×4`,
    ]);
    expect(compactDay(w.s, log, me, 0, 'de').lines[1]).toBe(`morgens — ich tauschte beim ${clan.name}-Clan Apfel ×2 gegen Feuerstein ×3`);
  });
});
