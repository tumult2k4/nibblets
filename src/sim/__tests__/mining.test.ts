import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { allocId } from '../../shared/ids';
import { addItem, countItem } from '../inventory';
import { shedSticks } from '../ecology';
import { mineTicks, Mine } from '../ai/actions/mine';
import { findChopTarget } from '../ai/actions/chop';
import { startAction, act } from '../ai/utility';
import { usesLeft, wearTool } from '../tools';
import { makeWorld, placePlant, spawnGoblin } from './helpers';
import type { Rock } from '../state';
import type { SimEvent } from '../../shared/types';
import type { World } from '../world';

function rock(w: World, x: number, y: number, size: Rock['size'] = 1, flintChance = 0): Rock {
  const r: Rock = { id: allocId(w.s), pos: { x, y }, size, stoneLeft: size * 4, flintChance };
  w.s.rocks.push(r);
  return r;
}

/** Run only the Mine action (no re-deciding) until it stops; returns ticks used. */
function mineOnce(w: World, g: ReturnType<typeof spawnGoblin>): number {
  expect(startAction(g, w, 'mine')).toBe(true);
  let t = 0;
  while (g.activity.status === 'running' && t < 2000) { act(w); w.s.tick++; t++; }
  return t;
}

describe('mining, sticks and tool durability (P4.1)', () => {
  it('Mine yields stone, shrinks the rock and removes it when spent', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const r = rock(w, 13, 12, 1);
    mineOnce(w, g);
    expect(countItem(g, 'stone')).toBe(CFG.mining.stonesPerTrip);
    expect(r.stoneLeft).toBe(4 - CFG.mining.stonesPerTrip);
    g.inventory = [];
    mineOnce(w, g);
    expect(w.s.rocks.includes(r)).toBe(false);
    expect(countItem(g, 'stone')).toBe(4 - CFG.mining.stonesPerTrip);
    expect(Mine.isAvailable(g, w) && Mine.score(g, w) > 0).toBe(false); // nothing left within reach
  });

  it('flint comes with stone at the rock\'s flint chance', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    rock(w, 13, 12, 3, 1);
    mineOnce(w, g);
    expect(countItem(g, 'flint')).toBe(countItem(g, 'stone'));
    const w2 = makeWorld();
    const g2 = spawnGoblin(w2, { pos: { x: 12, y: 12 } });
    rock(w2, 13, 12, 3, 0);
    mineOnce(w2, g2);
    expect(countItem(g2, 'flint')).toBe(0);
  });

  it('a pick doubles the pace and loses one use per stone', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    rock(w, 12.8, 12, 3);
    const bare = mineOnce(w, g);
    g.inventory = [];
    g.skills = {}; // compare the tool alone, not the practice
    addItem(g, { type: 'pick', qty: 1 });
    expect(mineTicks(g)).toBe(CFG.mining.ticksPerStone / 2);
    const fast = mineOnce(w, g);
    expect(fast).toBeLessThan(bare * 0.65);
    const pick = g.inventory.find((s) => s.type === 'pick')!;
    expect(usesLeft(pick)).toBe(25 - CFG.mining.stonesPerTrip);
  });

  it('a broken tool leaves its parts on the ground', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    addItem(g, { type: 'pick', qty: 1, dur: 1 });
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    wearTool(w, g, g.inventory[0]!);
    w.step();
    expect(g.inventory.some((s) => s.type === 'pick')).toBe(false);
    const parts = w.s.groundItems.map((i) => i.stack.type).sort();
    expect(parts).toEqual(['stick', 'stone']);
    expect(evs.some((e) => e.type === 'tool_broken' && e.item === 'pick')).toBe(true);
  });

  it('tools keep their wear in the inventory and never stack', () => {
    const w = makeWorld();
    const g = spawnGoblin(w);
    addItem(g, { type: 'stone_axe', qty: 1, dur: 4 });
    addItem(g, { type: 'stone_axe', qty: 1 });
    expect(g.inventory.filter((s) => s.type === 'stone_axe').map((s) => s.dur)).toEqual([4, undefined]);
  });

  it('trees are only chopped with a stone axe, which wears per felling', () => {
    const w = makeWorld();
    const g = spawnGoblin(w, { pos: { x: 12, y: 12 } });
    const tree = placePlant(w, 'tree', 'mature', { x: 14, y: 12 });
    expect(findChopTarget(g, w)).toBeNull();
    addItem(g, { type: 'stone_axe', qty: 1 });
    expect(findChopTarget(g, w)?.id).toBe(tree.id);
    expect(startAction(g, w, 'chop')).toBe(true);
    let t = 0;
    while (g.activity.status === 'running' && t < 2000) { act(w); w.s.tick++; t++; }
    expect(tree.stage).toBe('stump');
    const wood = w.s.groundItems.filter((i) => i.stack.type === 'wood').reduce((n, i) => n + i.stack.qty, 0);
    expect(wood).toBe(CFG.plants.wood.tree);
    expect(usesLeft(g.inventory.find((s) => s.type === 'stone_axe')!)).toBe(14);
  });

  it('grown trees shed sticks, up to a cap of loose sticks', () => {
    const w = makeWorld();
    for (let i = 0; i < 6; i++) placePlant(w, 'tree', 'mature', { x: 8 + i * 2, y: 16 });
    for (let i = 0; i < 400; i++) shedSticks(w);
    const n = w.s.groundItems.filter((i) => i.stack.type === 'stick').length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(CFG.mining.looseStickCap);
  });

  it('Divine mode keeps the Tools tab locked until god tier 2', () => {
    const w = makeWorld();
    w.s.god.mode = 'divine';
    w.s.god.tier = 0;
    const evs: SimEvent[] = [];
    w.bus.subscribe((e) => evs.push(e));
    w.push({ type: 'god_spawn_item', item: 'pick', qty: 1, pos: { x: 12, y: 12 } });
    w.step();
    expect(evs.some((e) => e.type === 'command_rejected' && e.reason === 'locked')).toBe(true);
    w.s.god.tier = 2;
    w.push({ type: 'god_spawn_item', item: 'pick', qty: 1, pos: { x: 12, y: 12 } });
    w.step();
    expect(w.s.groundItems.some((i) => i.stack.type === 'pick')).toBe(true);
  });
});
