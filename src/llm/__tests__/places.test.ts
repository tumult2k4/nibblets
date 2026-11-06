import { describe, expect, it } from 'vitest';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import { featureAt, placeAt, placesOf } from '../../sim/places';
import { placeName } from '../placeNames';
import { stateHash } from '../../sim/save';
import type { SimEvent } from '../../shared/types';

describe('place names (§15.6, P9.2)', () => {
  it('a death names its spot once; nearby deeds do not rename it; the name is worded per language', () => {
    const w = makeWorld({ size: 40 });
    const g = spawnGoblin(w, { pos: { x: 20, y: 20 } });
    w.emit({ type: 'goblin_died', goblinId: g.id, cause: 'old_age', at: { x: 20, y: 20 } });
    w.emit({ type: 'enemy_killed', enemyId: 999, kind: 'gnasher', killerId: g.id, at: { x: 23, y: 21 } });
    const evs: SimEvent[] = w.bus.flush();
    const ps = placesOf(w.s);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ cause: 'death', pos: { x: 20, y: 20 } });
    expect(evs.filter((e) => e.type === 'place_named')).toHaveLength(1);
    expect(placeAt(w.s, { x: 22, y: 22 })?.id).toBe(ps[0]!.id);
    expect(placeAt(w.s, { x: 35, y: 35 })).toBeNull();
    const en = placeName(ps[0]!, 'en'), de = placeName(ps[0]!, 'de');
    if (ps[0]!.person) {
      expect(en).toBe(`${g.name}${/[sxz]$/i.test(g.name) ? "'" : "'s"} ${en.split(' ').pop()}`);
    } else {
      expect(en).toMatch(/^(Sad|Weeping|Quiet) [A-Z][a-z]+$/);
      expect(de).toMatch(/^(Trauer|Tränen|Still)[a-zäöü]+$/);
    }
  });

  it('the name follows the land: by water, a pond or a shore; else a hill, a hollow or the ground cover', () => {
    const w = makeWorld({ size: 40 });
    const s = w.s, W = s.size.w;
    for (const t of s.tiles) { t.biome = 'meadow'; t.height = 0.3; }
    expect(featureAt(s, { x: 20, y: 20 })).toBe('meadow');
    for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) s.tiles[y * W + x]!.biome = 'water';
    expect(featureAt(s, { x: 12, y: 10 })).toBe('pond');
    s.tiles[30 * W + 30]!.height = 0.5;
    expect(featureAt(s, { x: 30, y: 30 })).toBe('hill');
    s.tiles[30 * W + 20]!.height = 0.1;
    expect(featureAt(s, { x: 20, y: 30 })).toBe('hollow');
    s.tiles[25 * W + 5]!.biome = 'forest';
    expect(featureAt(s, { x: 5, y: 25 })).toBe('wood');
  });

  it('names: the possessive, the German compound, festivals and stars', () => {
    const base = { id: 1, pos: { x: 0, y: 0 }, tick: 0 };
    expect(placeName({ ...base, feature: 'hill', cause: 'battle', word: 0, person: 'Grubnok' }, 'en')).toBe("Grubnok's Hill");
    expect(placeName({ ...base, feature: 'hill', cause: 'battle', word: 0, person: 'Grubnok' }, 'de')).toBe('Grubnoks Hügel');
    expect(placeName({ ...base, feature: 'pond', cause: 'death', word: 0, person: 'Fizz' }, 'en')).toBe("Fizz' Pond");
    expect(placeName({ ...base, feature: 'pond', cause: 'death', word: 0 }, 'en')).toBe('Sad Pond');
    expect(placeName({ ...base, feature: 'pond', cause: 'death', word: 0 }, 'de')).toBe('Trauerteich');
    expect(placeName({ ...base, feature: 'ford', cause: 'battle', word: 0 }, 'en')).toBe('Gnasher Ford');
    expect(placeName({ ...base, feature: 'hollow', cause: 'star', word: 0 }, 'en')).toBe('Star Hollow');
    expect(placeName({ ...base, feature: 'hollow', cause: 'star', word: 0 }, 'de')).toBe('Sternsenke');
  });

  it('naming draws nothing from the world random stream and replays the same', () => {
    const a = makeWorld({ size: 40, seed: 7 }), b = makeWorld({ size: 40, seed: 7 });
    const ga = spawnGoblin(a, { pos: { x: 10, y: 10 } }), gb = spawnGoblin(b, { pos: { x: 10, y: 10 } });
    const rng0 = a.s.rngState;
    a.emit({ type: 'goblin_died', goblinId: ga.id, cause: 'old_age', at: { x: 10, y: 10 } });
    b.emit({ type: 'goblin_died', goblinId: gb.id, cause: 'old_age', at: { x: 10, y: 10 } });
    expect(a.s.rngState).toBe(rng0);
    for (let i = 0; i < 50; i++) { a.step(); b.step(); }
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    expect(placesOf(a.s)).toEqual(placesOf(b.s));
  });
});
