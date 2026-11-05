/**
 * Skills (§5, P5.2): each goblin keeps XP per skill (forage, woodcraft, building, mining, crafting, combat, farming,
 * cooking, teaching). The level (0–10, fractional between thresholds) speeds the work up, unlocks fine crafts at 4,
 * and makes the goblin a little keener on that kind of work, so specialists emerge from what they happen to do.
 */
import { CFG } from '../config';
import { q4 } from '../../shared/math';
import type { SkillId } from '../../shared/types';
import type { ActionId, Goblin } from '../state';
import type { World } from '../world';

const K = CFG.skills;
export const SKILLS: readonly SkillId[] = ['forage', 'woodcraft', 'building', 'mining', 'crafting', 'combat', 'farming', 'cooking', 'teaching'];
export const MAX_LEVEL = K.levelXp.length;

/** Which skill an action trains and draws on (craft and site-work depend on the recipe; see crafting). */
export const ACTION_SKILL: Partial<Record<ActionId, SkillId>> = {
  harvest_fruit: 'forage', forage: 'forage', chop: 'woodcraft', build: 'building', repair_building: 'building',
  mine: 'mining', craft: 'crafting', attack: 'combat', defend_village: 'combat', guard: 'combat',
  plant_seed: 'farming', water_plant: 'farming', cut_grass: 'forage', pick_flowers: 'forage', process: 'cooking',
};

/** Level for an amount of XP: whole levels at the thresholds, linear in between. */
export function levelOf(xp: number): number {
  let prev = 0;
  for (let i = 0; i < K.levelXp.length; i++) {
    const next = K.levelXp[i]!;
    if (xp < next) return q4(i + Math.max(0, xp - prev) / (next - prev));
    prev = next;
  }
  return MAX_LEVEL;
}

/** XP that reads as `level` (inverse of `levelOf`). */
export function xpFor(level: number): number {
  const l = Math.max(0, Math.min(MAX_LEVEL, level));
  const i = Math.floor(l);
  const lo = i === 0 ? 0 : K.levelXp[i - 1]!;
  const hi = K.levelXp[Math.min(i, MAX_LEVEL - 1)]!;
  return q4(i >= MAX_LEVEL ? lo : lo + (l - i) * (hi - lo));
}

export const skillLevel = (g: Goblin, id: SkillId): number => levelOf(g.skills[id] ?? 0);
/** Work pace from skill: +10 % per level. */
export const skillSpeed = (g: Goblin, id: SkillId): number => 1 + K.speedPerLevel * skillLevel(g, id);

/**
 * Practice makes perfect: add XP (industrious goblins learn faster); a whole new level is an event. Younglings
 * watching the worker (`Learn`, P5.4) pick up a quarter of it.
 */
export function gainXp(w: World, g: Goblin, id: SkillId, amount: number): void {
  addXp(w, g, id, amount);
  if (g.lifeStage !== 'adult' && g.lifeStage !== 'elder') return;
  for (const c of w.goblinHash.query(g.pos, CFG.life.learnDist + 1.5))
    if (c.activity.action === 'learn' && c.activity.stage === 1 && c.activity.targetId === g.id) addXp(w, c, id, amount * CFG.life.learnXp);
}

function addXp(w: World, g: Goblin, id: SkillId, amount: number): void {
  const before = g.skills[id] ?? 0;
  const after = q4(before + amount * (1 - K.industryXp / 2 + K.industryXp * g.personality.industry));
  g.skills[id] = after;
  const lv = Math.floor(levelOf(after));
  if (lv > Math.floor(levelOf(before))) w.emit({ type: 'skill_up', goblinId: g.id, skill: id, level: lv, at: { ...g.pos } });
}

/** The goblin's strongest skill, or null if it has none to speak of. */
export function bestSkill(g: Goblin): { id: SkillId; level: number } | null {
  let best: { id: SkillId; level: number } | null = null;
  for (const id of SKILLS) {
    const level = skillLevel(g, id);
    if (level >= 1 && (!best || level > best.level)) best = { id, level };
  }
  return best;
}

/** Utility multiplier: a goblin is a little keener on work it is good at (specialization emerges). */
export function skillFocus(g: Goblin, action: ActionId): number {
  const id = ACTION_SKILL[action];
  return id ? 1 + K.focusPerLevel * skillLevel(g, id) : 1;
}
