import { CFG } from '../config';
import { q4 } from '../../shared/math';
import type { ID, Vec2 } from '../../shared/types';
import type { Goblin, MemoryEntry } from '../state';
import type { World } from '../world';
import { shoreTiles } from '../ai/targets';
import { visionRadius } from '../ai/considerations';
import { looksEdible } from '../ecology';

const M = CFG.memory;
type Kind = 'fruit_plant' | 'water' | 'rock' | 'stockpile' | 'place' | 'mushroom' | 'fishing_spot' | 'thief' | 'possessed';

/** Add or refresh a memory (§7.8). Same target id, or same kind within `mergeDist` for untargeted ones. */
export function remember(g: Goblin, w: World, kind: Kind, pos: Vec2, data = 0, targetId?: ID): void {
  const hit = g.memory.find((m) => m.kind === kind && (targetId !== undefined ? m.targetId === targetId : Math.hypot(m.pos.x - pos.x, m.pos.y - pos.y) < M.mergeDist));
  if (hit) {
    hit.data = data;
    hit.lastSeenTick = w.s.tick;
    hit.confidence = 1;
    return;
  }
  const e: MemoryEntry = { kind, pos: { x: pos.x, y: pos.y }, data, lastSeenTick: w.s.tick, confidence: 1 };
  if (targetId !== undefined) e.targetId = targetId;
  g.memory.push(e);
  if (g.memory.length > M.capacity) {
    let lo = 0;
    for (let i = 1; i < g.memory.length; i++) if (g.memory[i]!.confidence < g.memory[lo]!.confidence) lo = i;
    g.memory.splice(lo, 1);
  }
}

export function forget(g: Goblin, kind: string, targetId: ID): void {
  g.memory = g.memory.filter((m) => !(m.kind === kind && m.targetId === targetId));
}

export const memoriesOf = (g: Goblin, kind: Kind): MemoryEntry[] => g.memory.filter((m) => m.kind === kind);

/** Look around: remember fruit plants, mushrooms, water, rocks and the stockpile within vision. */
export function sense(g: Goblin, w: World, radius?: number): void {
  const r = radius ?? visionRadius(g, w);
  for (const p of w.plantHash.query(g.pos, r)) {
    if (p.kind !== 'apple_bush' && p.kind !== 'berry_bush') continue;
    if (p.stage === 'mature' || p.stage === 'old') remember(g, w, 'fruit_plant', p.pos, p.fruit, p.id);
    else forget(g, 'fruit_plant', p.id);
  }
  // remembered fruit plants in view that no longer exist → forget (seen gone); the current harvest
  // target is left for the action, which shows confusion on arrival
  const tgt = g.activity.action === 'harvest_fruit' ? g.activity.targetId : null;
  g.memory = g.memory.filter((m) => !(m.kind === 'fruit_plant' && m.targetId !== tgt && Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y) < r * 0.8 && !w.s.plants.some((p) => p.id === m.targetId)));
  let best: Vec2 | null = null;
  let bd = r * r;
  for (const t of shoreTiles(w)) {
    const d = (t.x - g.pos.x) ** 2 + (t.y - g.pos.y) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  if (best) remember(g, w, 'water', best);
  // mushrooms that look edible to it are remembered; vanished ones forgotten (redcaps only by those who don't know, P5.5)
  for (const m of w.s.mushrooms)
    if (looksEdible(g, m) && Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y) < r) remember(g, w, 'mushroom', m.pos, 0, m.id);
  g.memory = g.memory.filter((m) => !(m.kind === 'mushroom' && Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y) < r * 0.8 && !w.s.mushrooms.some((x) => x.id === m.targetId)));
  for (const rk of w.s.rocks) if (Math.hypot(rk.pos.x - g.pos.x, rk.pos.y - g.pos.y) < r) remember(g, w, 'rock', rk.pos, rk.stoneLeft, rk.id);
  const sp = w.s.village.stockpilePos;
  if (Math.hypot(sp.x - g.pos.x, sp.y - g.pos.y) < r) remember(g, w, 'stockpile', sp);
}

/** §6 senses: staggered every `senseEvery` ticks; first look covers the home area. Daily confidence decay. */
export function updateSenses(w: World): void {
  const s = w.s;
  const day = s.tick % CFG.time.dayTicks === 0;
  for (const g of s.goblins) {
    if (day) decay(g);
    if (s.tick % M.senseEvery !== g.id % M.senseEvery || g.heldByGod) continue;
    if (g.lifeStage === 'egg') continue;
    sense(g, w, g.memory.length === 0 ? M.initialRadius : undefined);
  }
}

function decay(g: Goblin): void {
  for (const m of g.memory) m.confidence = q4(m.confidence - (M.decayPerDay[m.kind] ?? M.decayPerDay.default!));
  g.memory = g.memory.filter((m) => m.confidence >= M.forgetBelow);
}

/** Stale memory → visible confusion (§7.8): `?` emote, forget, re-decide. */
export function confused(g: Goblin, w: World, kind: string, targetId: ID): void {
  forget(g, kind, targetId);
  w.emit({ type: 'emote', goblinId: g.id, emote: 'question' });
}
