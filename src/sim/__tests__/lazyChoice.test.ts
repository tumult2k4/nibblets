import { describe, expect, it } from 'vitest';
import { createWorld } from '../newWorld';
import { createGoblin } from '../goblin/goblin';
import { registerLineage } from '../goblin/family';
import { founderGenome } from '../goblin/genetics/founders';
import { spawnPlant } from '../plants';
import { isWalkable } from '../grid';
import { ACTIONS, chooseActions, scoreActions } from '../ai/utility';
import type { PlantKind } from '../../shared/types';
import type { World } from '../world';

/** A crowded village (P11.3's scenario, smaller): 60 goblins, 300 plants. */
function crowd(seed: number): World {
  const w = createWorld({ seed });
  const s = w.s, c = s.village.center;
  const spot = (r: number) => {
    for (let i = 0; i < 200; i++) {
      const x = Math.round((c.x + w.rng.range(-r, r)) * 100) / 100, y = Math.round((c.y + w.rng.range(-r, r)) * 100) / 100;
      if (x > 1 && y > 1 && x < s.size.w - 1 && y < s.size.h - 1 && isWalkable(s, Math.floor(x), Math.floor(y))) return { x, y };
    }
    return { ...c };
  };
  while (s.goblins.length < 60) {
    const g = createGoblin(s, w.rng, { genome: founderGenome(w.rng, 'mixed'), pos: spot(12), ageDays: w.rng.range(18, 60), clanId: s.clans[0]?.id ?? 0 });
    s.goblins.push(g);
    registerLineage(s, g);
  }
  const kinds: PlantKind[] = ['apple_bush', 'tree', 'berry_bush', 'flower'];
  while (s.plants.length < 300) spawnPlant(w, kinds[s.plants.length % 4]!, spot(40), 'mature', null);
  w.rebuildCaches();
  return w;
}

describe('choosing without scoring what cannot win (P11.3)', () => {
  it('every cap is at least the score, and the lazy best three are the full scoring’s best three', () => {
    for (const seed of [3, 8]) {
      const w = crowd(seed);
      let checked = 0, capped = 0;
      for (let round = 0; round < 6; round++) {
        w.run(300);
        for (const g of w.s.goblins) {
          for (const a of Object.values(ACTIONS)) {
            if (!a.cap || a.forced || !a.isAvailable(g, w)) continue;
            expect(a.score(g, w), `${a.id} for goblin ${g.id} on day tick ${w.s.tick}`).toBeLessThanOrEqual(a.cap(g, w) + 1e-12);
            capped++;
          }
          for (const planned of [null, 'chop', 'explore'] as const) {
            const full = scoreActions(g, w, true, planned).slice(0, 3);
            const lazy = chooseActions(g, w, planned);
            expect(lazy.map((r) => [r.id, r.final])).toEqual(full.map((r) => [r.id, r.final]));
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(900);
      expect(capped).toBeGreaterThan(2500);
    }
  });
});
