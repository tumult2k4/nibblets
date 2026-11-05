import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { bestSkill, gainXp, levelOf, skillFocus, skillLevel, skillSpeed, xpFor } from '../goblin/skills';
import { craftTicks, finishCraft, recipeSkill } from '../crafting';
import { mineTicks } from '../ai/actions/mine';
import { scoreActions, startAction, act } from '../ai/utility';
import { addItem } from '../inventory';
import { deserialize, serialize } from '../save';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { Goblin } from '../state';
import type { SimEvent } from '../../shared/types';

const K = CFG.skills;

/** Run one action without re-deciding until it stops; returns the ticks used. */
function runAction(w: World, g: Goblin, id: Parameters<typeof startAction>[2]): number {
  expect(startAction(g, w, id)).toBe(true);
  let t = 0;
  while (g.activity.status === 'running' && t < 3000) { act(w); w.s.tick++; t++; }
  return t;
}

describe('Skills (P5.2)', () => {
  it('XP reads as a level: whole at the thresholds, linear between, 10 at most; xpFor is its inverse', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(5)).toBeCloseTo(0.5);
    expect(levelOf(K.levelXp[0]!)).toBe(1);
    expect(levelOf(K.levelXp[3]!)).toBe(4);
    expect(levelOf(1e6)).toBe(10);
    for (const lv of [0, 0.5, 1, 2.25, 4, 7.5, 9.9, 10]) expect(levelOf(xpFor(lv))).toBeCloseTo(lv, 3);
  });

  it('practice adds XP (the industrious learn faster) and each whole level is announced', () => {
    const w = makeWorld();
    const lazy = spawnGoblin(w), keen = spawnGoblin(w);
    lazy.personality.industry = 0;
    keen.personality.industry = 1;
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    for (let i = 0; i < 13; i++) { gainXp(w, lazy, 'mining', 1); gainXp(w, keen, 'mining', 1); }
    expect(lazy.skills.mining).toBeCloseTo(13 * (1 - K.industryXp / 2), 4);
    expect(keen.skills.mining).toBeCloseTo(13 * (1 + K.industryXp / 2), 4);
    w.bus.flush();
    const ups = evs.filter((e) => e.type === 'skill_up');
    expect(ups).toHaveLength(2); // both reach level 1 (10.4 and 15.6 xp), neither 2
    expect(ups.every((e) => e.type === 'skill_up' && e.level === 1 && e.skill === 'mining')).toBe(true);
    expect(bestSkill(keen)).toMatchObject({ id: 'mining' });
    expect(bestSkill(spawnGoblin(w))).toBeNull();
  });

  it('a practised hand works faster: picking, mining and crafting', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const bush = placePlant(w, 'apple_bush', 'mature', { x: 13, y: 12 }, 6);
    g.needs.hunger = 50;
    const slow = runAction(w, g, 'harvest_fruit');
    g.inventory = [];
    g.skills.forage = xpFor(5);
    bush.fruit = 6;
    const fast = runAction(w, g, 'harvest_fruit');
    expect(fast).toBeLessThan(slow - 5);
    expect(skillSpeed(g, 'forage')).toBeCloseTo(1.5);
    const base = mineTicks(g);
    g.skills.mining = xpFor(10);
    expect(mineTicks(g)).toBe(Math.round(base / 2));
    expect(recipeSkill('spear')).toBe('woodcraft');
    expect(recipeSkill('stone_axe')).toBe('crafting');
    const t0 = craftTicks(g, 'stone_axe');
    g.skills.crafting = xpFor(4);
    expect(craftTicks(g, 'stone_axe')).toBe(Math.round(t0 / (1 + 4 * CFG.crafting.skillBonus)));
  });

  it('woodcraft makes fine spears; a skilled gardener waters more generously', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    g.skills.woodcraft = xpFor(4);
    let fine = 0;
    for (let i = 0; i < 200; i++) {
      addItem(g, { type: 'wood', qty: 2 });
      if (finishCraft(w, g, 'spear')?.fine) fine++;
      g.inventory = [];
    }
    expect(fine).toBeGreaterThan(20);
    expect(skillLevel(g, 'crafting')).toBe(0); // the spear trained woodcraft, not crafting
    const p = placePlant(w, 'apple_bush', 'young', { x: 8, y: 8 });
    p.hydration = 0;
    g.pos = { x: 4.5, y: 6 }; // near the pond
    g.skills.farming = xpFor(5);
    runAction(w, g, 'water_plant');
    expect(p.hydration).toBeCloseTo(Math.min(1, CFG.plants.waterHydration * (1 + K.waterPerLevel * 5)), 1);
  });

  it('specialization: goblins lean toward the work they are good at', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    expect(skillFocus(g, 'mine')).toBe(1);
    g.skills.mining = xpFor(5);
    expect(skillFocus(g, 'mine')).toBeCloseTo(1 + 5 * K.focusPerLevel);
    expect(skillFocus(g, 'chop')).toBe(1);
    expect(skillFocus(g, 'eat')).toBe(1);
    placePlant(w, 'apple_bush', 'mature', { x: 14, y: 12 }, 4);
    g.needs.hunger = 40;
    const row = scoreActions(g, w, false).find((r) => r.id === 'harvest_fruit')!;
    expect(row.skill).toBe(1);
    g.skills.forage = xpFor(3);
    const row2 = scoreActions(g, w, false).find((r) => r.id === 'harvest_fruit')!;
    expect(row2.final / row.final).toBeCloseTo(1 + 3 * K.focusPerLevel, 3);
  });

  it('v9 saves: skill levels become XP', () => {
    const w = makeWorld();
    spawnGoblin(w);
    const raw = JSON.parse(serialize(w.s)) as { version: number; goblins: { skills: Record<string, number> }[] };
    raw.version = 9;
    raw.goblins[0]!.skills = { crafting: 4, combat: 0.5, building: 2.25 };
    const g = deserialize(JSON.stringify(raw)).goblins[0]!;
    expect(levelOf(g.skills.crafting!)).toBeCloseTo(4);
    expect(levelOf(g.skills.combat!)).toBeCloseTo(0.5);
    expect(levelOf(g.skills.building!)).toBeCloseTo(2.25);
  });
});
