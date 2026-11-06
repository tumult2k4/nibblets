/** Gifts to one goblin (§17.5.1): Blessing, Inspiration, Fertility and the Shiny Gift (P5.9), Healing Touch (P6.6). */
import { CFG } from '../../config';
import type { Goblin } from '../../state';
import type { World } from '../../world';
import { addMood } from '../../goblin/mood';
import { mateOf } from '../../goblin/family';
import { DISCOVERABLE, discoveryChance, knowsAny, learn } from '../../knowledge';
import { giveTrinket } from '../../trinkets';
import { divineAct } from '../faith';
import type { CastTarget } from './nature';

const PW = CFG.powers;
const DAY = CFG.time.dayTicks;
const target = (w: World, c: CastTarget): Goblin | undefined => (c.targetId !== undefined ? w.goblin(c.targetId) : undefined);

/** Blessing: a day of +20 mood and a golden sparkle. */
export function castBlessing(w: World, c: CastTarget): void {
  const g = target(w, c);
  if (!g) return;
  addMood(w, g, 'blessed', PW.blessMood, PW.blessDays * DAY);
  divineAct(w, 'blessing', g.pos, g.id);
}

/**
 * Inspiration: a day of `inspired` (discovery ×3 while it lasts; its next craft comes out fine, and that spends it)
 * and, at once, one roll at ×10 to work out something new from what is at hand.
 */
export function castInspiration(w: World, c: CastTarget): void {
  const g = target(w, c);
  if (!g) return;
  for (const id of DISCOVERABLE) {
    if (knowsAny(g, id)) continue;
    const p = Math.min(1, discoveryChance(g, w, id) * PW.inspireRoll);
    if (p > 0 && w.rng.chance(p)) {
      learn(w, g, id, 'discovery');
      addMood(w, g, 'discovery', CFG.knowledge.discoveryMood, DAY);
      break;
    }
  }
  addMood(w, g, 'inspired', PW.inspireMood, PW.inspireDays * DAY);
  w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
  divineAct(w, 'inspiration', g.pos, g.id);
}

/** A goblin and its living mate, both adults: the pair Fertility blesses. */
export function fertilePair(g: Goblin | undefined, w: World): [Goblin, Goblin] | null {
  const m = g ? mateOf(g, w) : undefined;
  return g && m && g.lifeStage === 'adult' && m.lifeStage === 'adult' ? [g, m] : null;
}

/** Fertility: the pair's next egg comes within a day, whatever the day's roll or the stores say; twins 30 %. */
export function castFertility(w: World, c: CastTarget): void {
  const pair = fertilePair(target(w, c), w);
  if (!pair) return;
  for (const g of pair) {
    g.fertileUntil = w.s.tick + PW.fertileDays * DAY;
    w.emit({ type: 'emote', goblinId: g.id, emote: 'heart' });
  }
  divineAct(w, 'fertility', pair[0].pos, pair[0].id);
}

/** Healing Touch: full hp, wounds closed, illness gone (it counts as recovered, so no immunity comes of it). */
export function castHealingTouch(w: World, c: CastTarget): void {
  const g = target(w, c);
  if (!g) return;
  const h = g.health, ill = h.disease;
  Object.assign(h, { hp: h.maxHp, injuries: [], disease: null, coldTicks: 0 });
  if (ill) w.emit({ type: 'recovered', goblinId: g.id, disease: ill.id, at: { ...g.pos } });
  addMood(w, g, 'healed', CFG.miracles.healMood, CFG.miracles.healDays * DAY);
  divineAct(w, 'healing_touch', g.pos, g.id);
}

/** Shiny Gift: a rare trinket appears in its hands. */
export function castShinyGift(w: World, c: CastTarget): void {
  const g = target(w, c);
  if (!g) return;
  giveTrinket(w, g, 'rare');
  addMood(w, g, 'found_shiny', PW.shinyMood, PW.shinyDays * DAY);
  divineAct(w, 'shiny_gift', g.pos, g.id);
}
