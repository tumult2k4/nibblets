import { describe, expect, it } from 'vitest';
import { deedsFrom } from '../deedWatch';
import { earnDeed, resetDeedsCache } from '../deeds';
import { histText } from '../components/timeline';
import { POWER_DEFS } from '../../sim/god/powerDefs';
import { makeWorld, spawnGoblin } from '../../sim/__tests__/helpers';
import type { SimEvent } from '../../shared/types';

describe('divine deeds and the Timeline words (P11.1)', () => {
  it('earns the deeds from the sim events: a miracle, a Revelation, a skeptic won over, ten answered prayers', () => {
    resetDeedsCache();
    const w = makeWorld({ size: 24 }), g = spawnGoblin(w), tick = w.s.tick;
    const miracle = POWER_DEFS.find((p) => p.category === 'miracle')!.id;
    const got = deedsFrom([
      { type: 'divine_act', act: miracle, witnessIds: [], tick },
      { type: 'divine_act', act: 'revelation', witnessIds: [], tick },
      { type: 'converted', goblinId: g.id, tick },
      { type: 'divine_act', act: 'pet', targetId: g.id, witnessIds: [], tick },
    ] as SimEvent[], w).map(([id]) => id);
    expect(got).toEqual(expect.arrayContaining(['first_miracle', 'the_prophet', 'converted_skeptic']));
    expect(got).not.toContain('gentle_giant');
    const prayers = Array.from({ length: 10 }, (_, i) => ({ type: 'prayer_answered', prayerId: i, goblinId: g.id, kind: 'food', tick })) as SimEvent[];
    expect(deedsFrom(prayers, w).map(([id]) => id)).toContain('prayers_10');
    earnDeed('first_miracle');
    expect(deedsFrom([{ type: 'divine_act', act: miracle, witnessIds: [], tick }] as SimEvent[], w)).toHaveLength(0); // once
  });

  it('words a marker for the Timeline', () => {
    const w = makeWorld({ size: 24 }), g = spawnGoblin(w);
    expect(histText(w.s, { tick: 0, cat: 'birth', e: 'egg_hatched', id: g.id })).toContain(g.name);
    expect(histText(w.s, { tick: 0, cat: 'raid', e: 'clan_raid', k: 'Ash' })).toContain('Ash');
    expect(histText(w.s, { tick: 0, cat: 'disaster', e: 'earthquake' })).not.toContain('tl.');
  });
});
