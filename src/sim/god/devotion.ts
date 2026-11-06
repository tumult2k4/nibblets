/**
 * Faith over a lifetime (§17.4, P8.8). A goblin is born with 20 + piety × 30 + 0.3 × its parents' mean faith, and a
 * youngling drifts toward its parents' faith (nurture, 0.5 a day). A day without seeing (or hearing of) the god at
 * work costs 1 faith, never below piety × 20: the god must stay present. Love and fear settle back toward 30 and 10
 * (fear toward 40 under a wrathful god), 1 a day. Hourly, whether a need has gone dire (for desperate prayers).
 * Daily, the god's alignment marks the village: a kind god (above 50) +5 mood, a wrathful one (below −50) −5 and the
 * young grow timid; dependence: while god-given food is over 30 % of the season's meals, industry slips 0.002 a day.
 */
import { CFG } from '../config';
import { q4 } from '../../shared/math';
import type { SimEvent } from '../../shared/types';
import type { Goblin, WorldState } from '../state';
import type { World } from '../world';
import { holdMood } from '../goblin/mood';
import { drift } from '../goblin/drift';
import { faithOf } from './faithState';
import { SEASONS } from '../time';

const F = CFG.faith, G = CFG.god, DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;

/** The god's temper as the village feels it. */
export function godTemper(s: WorldState): 'kind' | 'wrathful' | null {
  const a = s.god.alignment;
  return a > F.alignment.kind ? 'kind' : a < F.alignment.wrath ? 'wrathful' : null;
}

/** Is the village leaning on food from the sky this season? */
export function dependent(s: WorldState): boolean {
  const m = faithOf(s).meals;
  return m.all >= F.alignment.minEaten && m.god / m.all > G.dependenceShare;
}

/** The god was seen at work (or heard of): faith keeps another day. */
export const sawGod = (g: Goblin, w: World): void => { g.godView.seenTick = w.s.tick; };

const toward = (v: number, rest: number, per: number): number => q4(v > rest ? Math.max(rest, v - per) : Math.min(rest, v + per));
const dire = (g: Goblin): boolean => Math.min(g.needs.hunger, g.needs.thirst, g.needs.warmth) < F.prayer.critical;

function daily(w: World, g: Goblin, temper: ReturnType<typeof godTemper>, dep: boolean): void {
  const v = g.godView, s = w.s;
  const floor = g.personality.piety * F.floor;
  if (s.tick - (v.seenTick ?? -Infinity) > DAY && v.faith > floor) v.faith = q4(Math.max(floor, v.faith - G.faithDecayPerDay));
  v.love = toward(v.love, F.love.rest, F.love.per);
  v.fear = toward(v.fear, temper === 'wrathful' ? F.fear.wrathRest : F.fear.rest, F.fear.per);
  const young = g.lifeStage === 'hatchling' || g.lifeStage === 'youngling';
  if (young && g.parents) {
    const ps = s.goblins.filter((p) => g.parents!.includes(p.id));
    if (ps.length) v.faith = toward(v.faith, ps.reduce((a, p) => a + p.godView.faith, 0) / ps.length, F.birth.nurture);
  }
  if (temper) holdMood(w, g, temper === 'kind' ? 'god_kind' : 'god_wrathful', temper === 'kind' ? F.alignment.mood : -F.alignment.mood, DAY + 2 * HOUR);
  if (temper === 'wrathful' && young) drift(g, 'cowed');
  if (dep && g.lifeStage !== 'egg') drift(g, 'dependent');
}

/** Hourly (§6 step 8b): dire needs for everyone; the daily round for a twenty-fourth of the village. */
export function updateDevotion(w: World): void {
  const s = w.s;
  if (s.tick % HOUR !== 0) return;
  const hour = Math.floor(s.tick / HOUR) % 24, temper = godTemper(s), dep = dependent(s);
  for (const g of s.goblins) {
    const v = g.godView;
    if (!dire(g)) delete v.direSince;
    else v.direSince ??= s.tick;
    if (g.id % 24 === hour) daily(w, g, temper, dep);
  }
}

/** Every meal counts toward the season's tally (dependence). */
export function noteMeal(w: World, e: SimEvent): void {
  if (e.type !== 'item_eaten') return;
  const m = faithOf(w.s).meals, season = w.clock.year * 4 + SEASONS.indexOf(w.clock.season);
  if (m.season !== season) { m.season = season; m.all = 0; m.god = 0; }
  m.all++;
  if (e.divine) m.god++;
}
