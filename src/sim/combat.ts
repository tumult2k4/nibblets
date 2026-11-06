/**
 * Combat (§14.2, P4.5). Melee resolves here: a goblin's swing (hit check from combat skill, damage = weapon × size ×
 * skill × fine, a knockback hop, weapon wear) and the hurt side of any blow (wounds, scars, waking, death). Enemies that
 * are struck turn on their attacker unless hurt or crowded; at 0 hp they drop a pelt and a bone (and any loot).
 */
import { raiderFell } from './clans';
import { CFG } from './config';
import { moodWorkMul } from './goblin/mood';
import { clamp, dist, q4 } from '../shared/math';
import { killGoblin } from './goblin/needs';
import { express } from './goblin/genetics/phenotype';
import { isSleeping } from './goblin/goblin';
import { bestWeapon, wearTool, weaponDmg } from './tools';
import { spawnGroundItem } from './groundItems';
import { itemDef } from './items';
import { enemyCanStand } from './fences';
import { scare } from './goblin/safety';
import { menaces } from './enemies/common';
import { foughtTogether } from './goblin/social';
import type { DeathCause, ItemType } from '../shared/types';
import type { Enemy, Goblin, Injury } from './state';
import type { World } from './world';
import { gainXp, skillLevel } from './goblin/skills';
import { diseaseWorkMul } from './disease';
import { giveTrinket, rollRarity } from './trinkets';
import { addReputation } from './mischief';

const C = CFG.combat;

export const hasInjury = (g: Goblin, k: Injury['kind']): boolean => g.health.injuries.some((i) => i.kind === k);
/** Work speed: a bruised arm slows chopping, mining, building and crafting by 20 %; so does being ill (P6.1). */
/** Work speed: a bruised arm, sickness and mood (§7.5, ×0.7 miserable to ×1.2 glowing). */
export const workMul = (g: Goblin): number => (hasInjury(g, 'bruised_arm') ? C.armMul : 1) * diseaseWorkMul(g) * moodWorkMul(g);
export const isVeteran = (g: Goblin): boolean => g.traits.includes('veteran');
const combatSkill = (g: Goblin): number => skillLevel(g, 'combat');

/** Enemies that still mean harm within `r` of `pos`. */
export function threatsNear(w: World, pos: { x: number; y: number }, r: number): Enemy[] {
  return w.s.enemies.filter((e) => menaces(e, pos, r));
}

/** 25 % chance of a wound when a blow leaves a goblin under half health. */
function maybeInjure(w: World, g: Goblin): void {
  if (g.health.hp >= C.injuryBelow * g.health.maxHp || !w.rng.chance(C.injuryChance)) return;
  const roll = w.rng.int(0, 2);
  if (roll === 2) {
    if (g.health.scars >= C.maxScars) return;
    g.health.scars++;
    w.emit({ type: 'injured', goblinId: g.id, injury: 'ear_notch', at: g.pos });
    return;
  }
  const kind: Injury['kind'] = roll === 0 ? 'limp' : 'bruised_arm';
  const until = w.s.tick + C.injuryDays * CFG.time.dayTicks;
  const cur = g.health.injuries.find((i) => i.kind === kind);
  if (cur) cur.until = Math.max(cur.until, until);
  else g.health.injuries.push({ kind, until });
  w.emit({ type: 'injured', goblinId: g.id, injury: kind, at: g.pos });
}

/** Take `dmg` hp from a goblin: it wakes, is frightened, may be wounded, and dies at 0. */
export function hurtGoblin(w: World, g: Goblin, dmg: number, cause: DeathCause): void {
  g.health.hp = q4(g.health.hp - dmg);
  w.emit({ type: 'goblin_hurt', goblinId: g.id, damage: dmg, cause, at: g.pos });
  if (g.health.hp <= 0) return killGoblin(w, g, cause);
  if (cause === 'combat') {
    scare(g, CFG.safety.bite);
    maybeInjure(w, g);
  }
  if (isSleeping(g) || g.activity.action === 'follow_wisp') g.activity.status = 'done'; // jolted awake (or out of a trance)
}

/** Wounds heal on their own; resting in one's hut (or lying down sick) heals them twice as fast, a friend's care ×1.5 (§14.2). */
export function updateInjuries(w: World): void {
  const t = w.s.tick;
  for (const g of w.s.goblins) {
    const list = g.health.injuries;
    if (!list.length) continue;
    const rest = (g.activity.action === 'sleep_home' && isSleeping(g)) || (g.activity.action === 'rest_sick' && g.activity.stage === 1);
    const mul = (rest ? C.restHealMul : 1) * (g.health.tendedUntil > t ? CFG.health.tendMul : 1);
    if (mul > 1) for (const i of list) i.until -= mul - 1;
    if (list.some((i) => i.until <= t)) g.health.injuries = list.filter((i) => i.until > t);
  }
}

export function killEnemy(w: World, e: Enemy, killer: Goblin | null): void {
  const i = w.s.enemies.indexOf(e);
  if (i < 0) return;
  w.s.enemies.splice(i, 1);
  const drops: [ItemType, number][] = [...Object.entries(CFG.enemies.drops[e.kind] ?? {})] as [ItemType, number][];
  if (e.carrying) drops.push([e.carrying.type, e.carrying.qty]);
  drops.forEach(([type, qty], k) => spawnGroundItem(w, { type, qty }, { x: q4(e.pos.x + 0.3 * Math.cos(k * 2.1)), y: q4(e.pos.y + 0.3 * Math.sin(k * 2.1)) }));
  if (killer) { killer.deeds.kills++; addReputation(killer, CFG.mischief.reputation.kill); }
  if (killer && w.rng.chance(CFG.trinkets.enemyDrop)) giveTrinket(w, killer, rollRarity(w)); // P8.2: its little hoard
  foughtTogether(w, e, e.mode === 'attack' ? e.targetId : null);
  if (e.clanId !== undefined) raiderFell(w, e.clanId); // P10.3
  w.emit({ type: 'enemy_killed', enemyId: e.id, kind: e.kind, killerId: killer?.id ?? null, at: e.pos });
}

/** Melee reach of the goblin's best weapon (fists 1.2). */
export const reachOf = (g: Goblin): number => {
  const wpn = bestWeapon(g);
  return Math.max(C.reach, wpn ? itemDef(wpn.type).weapon?.range ?? 0 : 0);
};

/** Damage of one landed blow: weapon (or fists) × (0.8 + 0.4 × size) × (1 + 5 % per combat level); fine already in weaponDmg. */
export function strikeDamage(g: Goblin): number {
  const wpn = bestWeapon(g);
  const base = wpn ? weaponDmg(wpn) : C.fists;
  return q4(base * (0.8 + 0.4 * express(g.genome, 'adultSize')) * (1 + combatSkill(g) * C.dmgPerSkill));
}

/** Chance that a goblin's swing lands: 70 % + 4 % per combat level, 60–90 %. */
export const hitChance = (g: Goblin): number => clamp(C.hitBase + combatSkill(g) * C.hitPerSkill, C.hitMin, C.hitMax);
/** A Gnasher's bite against a goblin: 75 %, less 2 % per combat level of the defender. */
export const biteChance = (g: Goblin): number => clamp(CFG.enemies.biteHit - combatSkill(g) * C.evadePerSkill, 0.5, 0.9);

/** One swing at an enemy. Returns true if it landed. */
export function strike(w: World, g: Goblin, e: Enemy): boolean {
  const hit = w.rng.chance(hitChance(g));
  // thick hide (the §14.2 armor term): bare fists barely get through, a spear hardly notices it
  const armor = (CFG.enemies[e.kind] as { armor?: number }).armor ?? 0;
  const dmg = hit ? q4(Math.max(1, strikeDamage(g) - armor)) : 0;
  w.emit({ type: 'attack', attackerId: g.id, targetId: e.id, damage: dmg, at: e.pos });
  if (!hit) return false;
  gainXp(w, g, 'combat', CFG.skills.xp.hit);
  const wpn = bestWeapon(g);
  if (wpn) wearTool(w, g, wpn);
  e.hp = q4(e.hp - dmg);
  if (e.hp <= 0) { killEnemy(w, e, g); return true; }
  // knockback hop away from the attacker
  const d = Math.max(0.01, dist(g.pos, e.pos));
  const kb = C.knockback * Math.min(1, dmg / C.knockbackFull); // a punch barely shoves it, a spear thrust sends it back
  const nx = q4(e.pos.x + ((e.pos.x - g.pos.x) / d) * kb), ny = q4(e.pos.y + ((e.pos.y - g.pos.y) / d) * kb);
  if (enemyCanStand(w, nx, ny)) e.pos = { x: nx, y: ny };
  // it turns on whoever hit it, unless it is about to run anyway or already has its teeth in someone (it doesn't let go)
  if (e.mode !== 'flee' && e.mode !== 'leave' && e.mode !== 'attack' && e.hp >= CFG.enemies[e.kind].fleeAt * e.maxHp) {
    e.mode = 'attack';
    e.targetId = g.id;
    e.target = { ...g.pos };
    e.path = [];
  }
  e.nextDecide = w.s.tick;
  return true;
}
