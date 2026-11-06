/**
 * Disease (§14.3, P6.1). A goblin catches a disease (`caught_disease`), carries it unseen through its incubation,
 * then shows it (`fell_ill`: symptoms, a slower hand, a bigger appetite, sneezes or retching, green spots) until it
 * has run its course, when it either recovers (`recovered`, immune for a while) or, by the disease's mortality, dies.
 *
 * Where diseases come from: sniffles from a chill in the rain, gut rot from bad food (a redcap, the unit of a stack
 * about to rot), shivers from two hours at freezing, spotted fever from a rare outbreak in a big village. Contact
 * diseases spread from a sick goblin to those close by (more in a chat) and to hut-mates asleep beside it (more in a
 * crowded hut). The `vigor` gene makes a goblin harder to infect, quicker to recover and likelier to survive.
 * Lying down and being tended by a friend speed recovery (care.ts).
 */
import { CFG } from './config';
import { clamp, dist, q4 } from '../shared/math';
import { perDay } from './time';
import type { DiseaseDef } from './cfg/health';
import type { Goblin, Illness } from './state';
import type { World } from './world';
import type { ID } from '../shared/types';
import { express } from './goblin/genetics/phenotype';
import { isSleeping } from './goblin/goblin';
import { killGoblin } from './goblin/needs';

const H = CFG.health;
const DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks;
export const DISEASES = Object.keys(H.diseases);

export const diseaseDef = (id: string): DiseaseDef | undefined => H.diseases[id];

/** The disease it is showing right now (not while still incubating). */
export function sickness(g: Goblin): DiseaseDef | undefined {
  const d = g.health.disease;
  return d && d.stage === 'sick' ? H.diseases[d.id] : undefined;
}
export const isSick = (g: Goblin): boolean => !!sickness(g);

/** Work speed while ill (multiplies into injuries' workMul). */
export const diseaseWorkMul = (g: Goblin): number => sickness(g)?.symptoms.workMul ?? 1;
/** Appetite while ill (hunger decay ×). */
export const diseaseHungerMul = (g: Goblin): number => sickness(g)?.symptoms.hungerMul ?? 1;

/** How easily it catches things: 0.5 (vigor 1.2) … 1.5 (vigor 0.8); also scales its mortality. */
export const frailty = (g: Goblin): number => clamp(1 - (express(g.genome, 'vigor') - 1) * H.resistK, 0.3, 2);
/** How fast it gets better: 0.6 … 1.4 by vigor, × lying down, × being tended, × a dose of remedy (P6.5). */
export function recoveryRate(g: Goblin, w: World): number {
  let r = clamp(1 + (express(g.genome, 'vigor') - 1) * H.recoverK, 0.3, 2);
  if (resting(g)) r *= H.restMul;
  if (g.health.tendedUntil > w.s.tick) r *= H.tendMul;
  if (g.health.disease?.remedy) r *= H.remedyMul;
  return r;
}
const resting = (g: Goblin): boolean => (g.activity.action === 'rest_sick' && g.activity.stage === 1) || (g.activity.action === 'sleep_home' && isSleeping(g));

/** Give `g` a disease (if it has none and is not immune). `force` skips the immunity check (the god's Plague). */
export function infect(w: World, g: Goblin, id: string, fromId: ID | null = null, force = false): boolean {
  const def = H.diseases[id];
  if (!def || g.health.disease || (!force && (g.health.immune[id] ?? 0) > w.s.tick)) return false;
  g.health.disease = { id, stage: def.incubationDays > 0 ? 'incubating' : 'sick', progress: 0, since: w.s.tick };
  w.emit({ type: 'caught_disease', goblinId: g.id, disease: id, fromId, at: { ...g.pos } });
  if (def.incubationDays <= 0) showSymptoms(w, g, id);
  return true;
}

/** The god's Plague (P6.6): whatever it had gives way to `id`, which shows at once. */
export function strikeWith(w: World, g: Goblin, id: string): boolean {
  g.health.disease = null;
  if (!infect(w, g, id, null, true)) return false;
  const ill = g.health.disease as Illness | null;
  if (ill && ill.stage === 'incubating') { ill.stage = 'sick'; ill.progress = 0; showSymptoms(w, g, id); }
  return true;
}

/** A chance at `id`, resisted by vigor. */
export function exposeTo(w: World, g: Goblin, id: string, chance: number, fromId: ID | null = null): boolean {
  if (g.health.disease || (g.health.immune[id] ?? 0) > w.s.tick) return false;
  return w.rng.chance(clamp(chance * frailty(g), 0, 1)) && infect(w, g, id, fromId);
}

function showSymptoms(w: World, g: Goblin, id: string): void {
  w.emit({ type: 'fell_ill', goblinId: g.id, disease: id, at: { ...g.pos } });
}

function runCourse(w: World, g: Goblin, dead: Goblin[]): void {
  const ill = g.health.disease!, def = H.diseases[ill.id];
  if (!def) { g.health.disease = null; return; }
  if (ill.stage === 'incubating') {
    ill.progress = q4(ill.progress + perDay(1));
    if (ill.progress >= def.incubationDays) {
      ill.stage = 'sick';
      ill.progress = 0;
      showSymptoms(w, g, ill.id);
    }
    return;
  }
  ill.progress = q4(ill.progress + perDay(1) * recoveryRate(g, w));
  if (def.hpDrainPerDay > 0 && g.health.hp > H.drainFloor) g.health.hp = q4(Math.max(H.drainFloor, g.health.hp - perDay(def.hpDrainPerDay)));
  if (def.emote && w.rng.chance(1 / H.emoteEvery) && !isSleeping(g)) w.emit({ type: 'emote', goblinId: g.id, emote: def.emote });
  if (ill.progress < def.durationDays) return;
  const deadly = !def.deadlyFor || def.deadlyFor.includes(g.lifeStage);
  if (deadly && w.rng.chance(clamp(def.mortality * frailty(g) * (ill.remedy ? H.remedyMortality : 1), 0, 1))) { dead.push(g); return; }
  g.health.disease = null;
  if (def.immuneDays > 0) g.health.immune[ill.id] = w.s.tick + def.immuneDays * DAY;
  w.emit({ type: 'recovered', goblinId: g.id, disease: ill.id, at: { ...g.pos } });
}

/** Sick ones pass contact diseases on: to anyone close (more in a chat), and to hut-mates asleep beside them. */
function spread(w: World, g: Goblin): void {
  const ill = g.health.disease, def = ill && sickness(g);
  if (!ill || !def || def.transmission !== 'contact') return;
  const asleep = isSleeping(g) && g.homeId !== null;
  const crowded = asleep && w.s.goblins.filter((o) => o.homeId === g.homeId && isSleeping(o)).length >= H.crowded;
  for (const o of w.goblinHash.query(g.pos, H.contactRange)) {
    if (o === g || o.health.disease || dist(o.pos, g.pos) > H.contactRange) continue;
    if (asleep && isSleeping(o) && o.homeId === g.homeId) {
      exposeTo(w, o, ill.id, def.sleepShare * (crowded ? H.crowdMul : 1), g.id);
      continue;
    }
    const chatting = g.activity.action === 'chat' && o.activity.action === 'chat' && (g.activity.targetId === o.id || o.activity.targetId === g.id);
    exposeTo(w, o, ill.id, def.contact * (chatting ? H.chatMul : 1), g.id);
  }
}

/** Sniffles from a chill in the rain; shivers after two hours at freezing. */
function weatherIlls(w: World, g: Goblin, hourly: boolean): void {
  const h = g.health;
  h.coldTicks = g.needs.warmth <= 1 ? h.coldTicks + 1 : 0;
  if (h.coldTicks >= H.shiverTicks && !h.disease) infect(w, g, 'shivers');
  if (hourly && g.wetUntil > w.s.tick && g.needs.warmth < H.chillBelow) exposeTo(w, g, 'sniffles', H.chillSniffles);
}

/** About once in two years a big village gets spotted fever: one adult falls ill out of nowhere. */
function outbreak(w: World): void {
  const s = w.s;
  if (s.tick % DAY !== Math.round(DAY * 0.3) || s.goblins.length <= H.feverMinPop) return;
  const daysPerYear = CFG.time.daysPerSeason * 4;
  if (!w.rng.chance(H.feverYearlyChance / daysPerYear)) return;
  const pool = s.goblins.filter((g) => g.lifeStage === 'adult' && !g.health.disease);
  const g = pool.length ? w.rng.pick(pool) : undefined;
  if (g && infect(w, g, 'spotted_fever', null, true)) w.emit({ type: 'outbreak', goblinId: g.id, disease: 'spotted_fever', at: { ...g.pos } });
}

/** §6 step 11d (with wounds): diseases run their course, spread (each goblin hourly, staggered) and break out. */
export function updateDiseases(w: World): void {
  const dead: Goblin[] = [];
  for (const g of w.s.goblins) {
    if (g.heldByGod) continue;
    const hourly = (w.s.tick + g.id * 7) % HOUR === 0;
    weatherIlls(w, g, hourly);
    if (!g.health.disease) continue;
    runCourse(w, g, dead);
    if (hourly && g.health.disease) spread(w, g);
  }
  for (const g of dead) killGoblin(w, g, 'disease');
  outbreak(w);
}
