/**
 * Leadership (§13.5–13.6, P8.4). The village chooses a chief (on day 2, then every new year and after a chief dies):
 * the best score of reputation × 0.5, age respect × 0.2 and the others' mean opinion × 0.3. The chief's nature sets
 * the policies: industrious → work ×1.1; brave → a night watch of the two bravest armed adults; sociable → more
 * festivals (P8.5); pious → the shrine first (P8.6) and quarantine; mischievous → lax about theft, earnest → strict.
 * Justice: the chief takes up a known theft by a goblin of poor name and orders it put right (the thing back, or a
 * gift and an apology) or, for the worst, two days' exile outside the village. Exiles live off the land and come back
 * (P10.3: or go over to a rival clan).
 */
import { maybeDefect } from './migration';
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import type { ActionId, Goblin, Guilt } from './state';
import type { World } from './world';
import { ageDays } from './goblin/goblin';
import { opinionOf } from './goblin/social';
import { addMood } from './goblin/mood';
import { countItem } from './inventory';
import { bestWeapon } from './tools';
import { addReputation, lawOf, rest } from './mischief';

const L = CFG.leadership, P = L.policy, J = L.justice, DAY = CFG.time.dayTicks;
const S = CFG.goblin.stageDays, GROWN = S.egg + S.hatchling + S.youngling;

export const chiefOf = (w: World): Goblin | undefined => (w.s.village.chiefId !== null ? w.goblin(w.s.village.chiefId) : undefined);
export const isExiled = (g: Goblin, w: World): boolean => (g.exiledUntil ?? 0) > w.s.tick;
export const onWatch = (g: Goblin, w: World): boolean => !!w.s.village.watch?.includes(g.id);
/** How far from the center an exile must keep. */
export const exileRadius = (): number => CFG.world.villageRadius + J.exileDist;

/** What an exile may still do: feed, drink and sleep rough out there, keep itself safe, roam. */
export const EXILE_OK: ReadonlySet<ActionId> = new Set<ActionId>([
  'idle', 'wander', 'explore', 'eat', 'eat_core', 'drink', 'harvest_fruit', 'forage', 'pick_up', 'drop', 'equip', 'sleep_ground',
  'flee', 'scatter', 'hunt', 'fish', 'hunt_trinket', 'exile', 'escape_fire', 'look_up', 'struggle', 'sulk', 'wander_off', 'rest_sick', 'defect',
]);

// ---------------------------------------------------------------- the chief

/** Age respect, 0 on growing up to 100 by `respectDays`. */
export const respect = (g: Goblin, w: World): number => clamp(((ageDays(g, w.s.tick) - GROWN) / (L.respectDays - GROWN)) * 100, 0, 100);

/** The others' mean opinion of `g` (those with no view of it count as 0). */
export function standing(g: Goblin, w: World): number {
  let sum = 0, n = 0;
  for (const o of w.s.goblins) if (o !== g && o.lifeStage !== 'egg') { sum += opinionOf(o, g.id); n++; }
  return n ? sum / n : 0;
}

export const chiefScore = (g: Goblin, w: World): number =>
  q4(g.reputation * L.score.reputation + respect(g, w) * L.score.age + standing(g, w) * L.score.opinion);

/** Choose the chief now: the best score among grown goblins at home (not the shaman). Returns it. */
export function electChief(w: World): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const g of w.s.goblins) {
    if ((g.lifeStage !== 'adult' && g.lifeStage !== 'elder') || isExiled(g, w) || g.role === 'shaman') continue;
    const sc = chiefScore(g, w);
    if (sc > bs || (sc === bs && best && g.id < best.id)) { bs = sc; best = g; }
  }
  if (!best) return null;
  const prevId = w.s.village.chiefId;
  for (const g of w.s.goblins) if (g.role === 'chief' && g !== best) g.role = 'none';
  best.role = 'chief';
  w.s.village.chiefId = best.id;
  setPolicies(w, best);
  if (prevId !== best.id) {
    addMood(w, best, 'made_chief', 8, DAY);
    w.emit({ type: 'chief_chosen', goblinId: best.id, previousId: prevId });
  }
  return best;
}

/** The chief's nature sets the village's policies (§13.6). */
export function setPolicies(w: World, c: Goblin): void {
  const p = c.personality, hi = (x: number) => x >= P.high;
  w.s.village.policies = {
    ...(hi(p.industry) ? { work: P.workMul } : {}),
    ...(hi(p.bravery) ? { rota: true } : {}),
    ...(hi(p.sociability) ? { festivals: P.festivalMul } : {}),
    ...(hi(p.piety) ? { shrine: true, quarantine: true } : {}),
    ...(hi(p.mischief) ? { law: P.law.lax } : p.mischief <= P.low ? { law: P.law.strict } : {}),
  };
}

/** Work actions under an industrious chief. */
export const policyWorkMul = (w: World): number => w.s.village.policies?.work ?? 1;

/** Tonight's watch: the two bravest armed adults with the strength for it (only under a brave chief). */
export function pickWatch(w: World): void {
  if (!w.s.village.policies?.rota) { delete w.s.village.watch; return; }
  w.s.village.watch = w.s.goblins
    .filter((g) => g.lifeStage === 'adult' && !isExiled(g, w) && !g.heldByGod && !!bestWeapon(g) && g.needs.energy >= L.watch.minEnergy && g.health.hp > g.health.maxHp * 0.6)
    .sort((a, b) => b.personality.bravery - a.personality.bravery || a.id - b.id)
    .slice(0, P.watch).map((g) => g.id);
  for (const id of w.s.village.watch) { const g = w.goblin(id)!; g.deeds.watches = (g.deeds.watches ?? 0) + 1; } // P8.7: toward the night owl
}

/** Elections in the morning, the watch at dusk, exiles home when their time is up. */
export function updateLeadership(w: World): void {
  const t = w.s.tick, c = w.clock;
  if (t % 50 === 0) for (const g of w.s.goblins) {
    if (g.exiledUntil === undefined || g.exiledUntil > t) continue;
    if (w.s.leaving?.[g.id] !== undefined) { // P10.3: on its way to a clan; if it cannot get away in a day, it comes home
      if (t < g.exiledUntil + DAY) continue;
      delete w.s.leaving[g.id];
    } else if (maybeDefect(w, g)) continue;
    delete g.exiledUntil;
    w.emit({ type: 'exile_ended', goblinId: g.id, at: { ...g.pos } });
  }
  if (t % DAY === Math.floor(DAY * L.watch.pickAt)) pickWatch(w);
  if (t % DAY !== Math.floor(DAY * L.electAt) || c.day < L.firstDay) return;
  const newYear = c.season === 'spring' && c.seasonDay === 0;
  if (!chiefOf(w) || newYear) electChief(w);
}

// ---------------------------------------------------------------- justice

/** A thief the chief should take up: a known theft not yet put right, a poor name, not already sent away. */
export function culprit(c: Goblin, w: World): { o: Goblin; gu: Guilt } | null {
  for (const o of w.s.goblins) {
    if (o === c || o.reputation >= J.below || isExiled(o, w) || o.heldByGod || dist(o.pos, c.pos) > J.range) continue;
    const gu = (o.guilt ?? []).find((x) => x.known && !x.settled && !x.ordered);
    if (gu) return { o, gu };
  }
  return null;
}

/** Below this reputation the chief exiles: −45 under the usual law, sooner when strict, later when lax. */
export const exileLine = (w: World): number => J.exileBelow + (lawOf(w) - CFG.mischief.theft.law) * 100;

export function sentenceFor(o: Goblin, gu: Guilt, w: World): 'return' | 'apology' | 'exile' {
  if (o.reputation <= exileLine(w) && o.lifeStage !== 'youngling' && w.clock.season !== 'winter') return 'exile';
  const has = gu.trinketId !== undefined ? o.trinkets.includes(gu.trinketId) : !!gu.item && countItem(o, gu.item) > 0;
  return has ? 'return' : 'apology';
}

/** The chief has spoken: the thief must put it right (it goes and says sorry), or leave the village for two days. */
export function pronounce(w: World, c: Goblin, o: Goblin, gu: Guilt): void {
  const kind = sentenceFor(o, gu, w);
  const victim = w.goblin(gu.victimId);
  addMood(w, o, 'judged', J.thiefMood, DAY);
  if (victim) addMood(w, victim, 'justice', J.victimMood, DAY);
  addReputation(c, J.chiefReputation);
  rest(w, o, 'steal_rest', J.restDays);
  if (kind === 'exile') {
    o.exiledUntil = w.s.tick + J.exileDays * DAY;
    for (const x of o.guilt ?? []) if (x.known) x.settled = true;
    if (w.s.village.watch) w.s.village.watch = w.s.village.watch.filter((id) => id !== o.id);
    o.activity.status = 'done'; // off it goes
  } else for (const x of o.guilt ?? []) if (x.known && !x.settled) x.ordered = true;
  w.emit({ type: 'justice', chiefId: c.id, goblinId: o.id, victimId: gu.victimId, sentence: kind, at: { ...o.pos } });
}
