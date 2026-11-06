/**
 * Earning the divine deeds (§17.10, P11.1) from what the sim tells the UI: the first miracle, 50 goblins set down
 * gently, 10 and 50 answered prayers, a skeptic won over, a celebration the god asked for, a Revelation, five
 * generations in the lineage book, a village of 50, the god's alignment at either end, a goblin raised from its grave.
 * ("A Book About You" comes from the LLM director.) Never in a replay or on the title screen's island.
 */
import type { SimEvent } from '../shared/types';
import type { World } from '../sim/world';
import { POWER_DEFS } from '../sim/god/powerDefs';
import { generations } from '../sim/goblin/lineage';
import { countDeed, deeds, type DeedId } from './deeds';

const MIRACLES = new Set(POWER_DEFS.filter((p) => p.category === 'miracle').map((p) => p.id));

/** The deeds these events earn, each with the words for how (its i18n parameters). */
export function deedsFrom(evs: readonly SimEvent[], w: World): [DeedId, Record<string, string | number>][] {
  const out: [DeedId, Record<string, string | number>][] = [], have = deeds(), s = w.s;
  const name = (id?: number) => (id !== undefined ? w.goblin(id)?.name ?? s.lineage[id]?.name ?? '?' : '?');
  const add = (id: DeedId, p: Record<string, string | number> = {}) => { if (!have[id] && !out.some((x) => x[0] === id)) out.push([id, p]); };
  for (const e of evs) {
    if (e.type === 'divine_act') {
      if (MIRACLES.has(e.act)) add('first_miracle', { power: e.act });
      if (e.act === 'revelation') add('the_prophet');
      if (e.act === 'set_down' && e.targetId !== undefined && w.goblin(e.targetId) && !have.gentle_giant && countDeed('set_down') >= 50) add('gentle_giant');
    }
    if (e.type === 'prayer_answered') {
      const n = countDeed('prayers');
      if (n >= 10) add('prayers_10', { n });
      if (n >= 50) add('prayers_50', { n });
    }
    if (e.type === 'converted') add('converted_skeptic', { name: name(e.goblinId) });
    if (e.type === 'wish_fulfilled' && e.intent === 'celebrate') add('feast_in_your_name');
    if (e.type === 'resurrected') add('lazarus', { name: name(e.goblinId) });
    if (e.type === 'day_started') {
      if (!have.five_generations && 1 + Math.max(0, ...generations(s).values()) >= 5) add('five_generations');
      if (s.goblins.length >= 50) add('village_of_50');
      if (s.god.alignment <= -100) add('wrath_of_the_sky');
      if (s.god.alignment >= 100) add('saint_of_apples');
    }
  }
  return out;
}
