import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { allocId } from '../../shared/ids';
import { addItem, countItem } from '../inventory';
import { deposit } from '../stockpile';
import { completeBuilding, placeBlueprint } from '../buildings';
import { claim } from '../ai/actions/home';
import { chooseCraft, finishCraft } from '../crafting';
import { STARTER_RECIPES } from '../recipes';
import { maxUses, toolFor, usesLeft } from '../tools';
import { act, startAction } from '../ai/utility';
import { deserialize, serialize } from '../save';
import { makeWorld, spawnGoblin } from './helpers';
import type { World } from '../world';
import type { Goblin } from '../state';

function runAction(w: World, g: Goblin, id: 'craft' | 'equip' | 'mine'): void {
  expect(startAction(g, w, id)).toBe(true);
  for (let t = 0; t < 2000 && g.activity.status === 'running'; t++) { act(w); w.s.tick++; }
}

describe('crafting, quality and equip (P4.2)', () => {
  it('goblins start knowing the starter recipes only', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    expect(STARTER_RECIPES).toEqual(expect.arrayContaining(['hut', 'campfire', 'spear', 'fence']));
    expect(g.knownRecipes).toEqual([...STARTER_RECIPES]);
    expect(g.knownRecipes).not.toContain('stone_spear');
  });

  it('recipe consumption is exact', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    addItem(g, { type: 'wood', qty: 3 });
    addItem(g, { type: 'stick', qty: 2 });
    addItem(g, { type: 'flint', qty: 1 });
    g.knownRecipes.push('stone_spear');
    expect(finishCraft(w, g, 'stone_spear')?.type).toBe('stone_spear');
    expect([countItem(g, 'wood'), countItem(g, 'stick'), countItem(g, 'flint')]).toEqual([2, 1, 0]);
    expect(finishCraft(w, g, 'stone_spear')).toBeNull(); // no flint left: nothing consumed
    expect([countItem(g, 'wood'), countItem(g, 'stick')]).toEqual([2, 1]);
    expect(finishCraft(w, g, 'spear')?.type).toBe('spear');
    expect(countItem(g, 'wood')).toBe(0);
  });

  it('only known recipes are chosen; the better weapon wins', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    g.personality.bravery = 1;
    addItem(g, { type: 'wood', qty: 3 });
    addItem(g, { type: 'stick', qty: 1 });
    addItem(g, { type: 'flint', qty: 1 });
    expect(chooseCraft(g, w)?.id).toBe('spear');
    g.knownRecipes.push('stone_spear');
    expect(chooseCraft(g, w)?.id).toBe('stone_spear');
    g.equipped.hand = { type: 'stone_spear', qty: 1 };
    expect(chooseCraft(g, w)).toBeNull(); // already holds the best it can make
  });

  it('crafting takes spare stock but never what a blueprint waits for', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    placeBlueprint(w, 'hut', { x: 6, y: 18 }, null);
    deposit(w.s, { type: 'wood', qty: 6 });
    expect(chooseCraft(g, w)).toBeNull();
    deposit(w.s, { type: 'wood', qty: 2 });
    expect(chooseCraft(g, w)?.id).toBe('spear');
    runAction(w, g, 'craft');
    expect(g.inventory.some((s) => s.type === 'spear')).toBe(true);
    expect(w.s.village.stockpile.find((s) => s.type === 'wood')?.qty).toBe(6);
  });

  it('fine items need skill 4 and come about a quarter of the time', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    let fine = 0;
    for (let i = 0; i < 16; i++) {
      addItem(g, { type: 'wood', qty: 2 });
      if (finishCraft(w, g, 'spear')?.fine) fine++;
      g.inventory = [];
    }
    expect(fine).toBe(0);
    expect(g.skills.crafting).toBeCloseTo(16 * CFG.crafting.skillPerCraft);
    for (let i = 0; i < 400; i++) {
      addItem(g, { type: 'wood', qty: 2 });
      if (finishCraft(w, g, 'spear')?.fine) fine++;
      g.inventory = [];
    }
    expect(fine / 400).toBeGreaterThan(0.19);
    expect(fine / 400).toBeLessThan(0.31);
    const pick = { type: 'pick' as const, qty: 1, fine: true };
    expect(usesLeft(pick)).toBe(maxUses('pick') * 1.5 + 0.5);
    g.inventory = [pick];
    expect(toolFor(g, 'mine').mul).toBe(2.5);
  });

  it('Equip puts the best weapon in the hand and frees its slot', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    addItem(g, { type: 'spear', qty: 1 });
    addItem(g, { type: 'wood', qty: 2 });
    runAction(w, g, 'equip');
    expect(g.equipped.hand?.type).toBe('spear');
    expect(g.inventory.map((s) => s.type)).toEqual(['wood']);
    addItem(g, { type: 'club', qty: 1 });
    runAction(w, g, 'equip');
    expect(g.equipped.hand?.type).toBe('club');
    expect(g.inventory.map((s) => s.type).sort()).toEqual(['spear', 'wood']);
  });

  it('a held pick is used for mining and breaks out of the hand', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    w.s.rocks.push({ id: allocId(w.s), pos: { x: 13, y: 12 }, size: 3, stoneLeft: 12, flintChance: 0 });
    g.equipped.hand = { type: 'pick', qty: 1, dur: 2 };
    runAction(w, g, 'mine');
    expect(g.equipped.hand).toBeNull();
    expect(w.s.groundItems.map((i) => i.stack.type).sort()).toEqual(['stick', 'stone']);
  });

  it('a wood-carrying goblin crafts and equips a spear on its own', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    g.personality.bravery = 1;
    const hut = placeBlueprint(w, 'hut', { x: 16, y: 16 }, g.id);
    completeBuilding(w, hut, g.id);
    claim(w, g, hut);
    const fire = placeBlueprint(w, 'campfire', { x: 9, y: 9 }, null); // the village already has a full fire
    completeBuilding(w, fire, null);
    fire.fuel = CFG.fire.maxFuel;
    addItem(g, { type: 'wood', qty: 2 });
    for (let t = 0; t < 1500 && g.equipped.hand?.type !== 'spear'; t++) {
      w.step();
      g.needs.hunger = Math.max(g.needs.hunger, 80); g.needs.thirst = Math.max(g.needs.thirst, 80);
    }
    expect(g.equipped.hand?.type).toBe('spear');
  });

  it('v3 saves gain starter recipes and stack-shaped equipment', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    const raw = JSON.parse(serialize(w.s)) as { version: number; goblins: { knownRecipes: string[]; equipped: Record<string, unknown> }[] };
    raw.version = 3;
    raw.goblins[0]!.knownRecipes = [];
    raw.goblins[0]!.equipped.hand = 'spear';
    const s = deserialize(JSON.stringify(raw));
    expect(s.goblins[0]!.knownRecipes).toEqual(expect.arrayContaining([...STARTER_RECIPES]));
    expect(s.goblins[0]!.equipped.hand).toEqual({ type: 'spear', qty: 1 });
    expect(g.id).toBe(s.goblins[0]!.id);
  });
});
