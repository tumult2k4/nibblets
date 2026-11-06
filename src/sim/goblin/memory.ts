import { CFG } from '../config';
import { q4 } from '../../shared/math';
import type { ID, Vec2 } from '../../shared/types';
import type { Goblin, MemoryEntry } from '../state';
import type { World } from '../world';
import { bushes, nearestShoreWithin } from '../ai/targets';
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

/** The ids of the plants and mushrooms there are now (P11.3: a set per tick, not a pass over all plants per memory). */
let ids: { tick: number; plants: unknown; np: number; mush: unknown; nm: number; p: Set<ID>; m: Set<ID> } | null = null;
function present(w: World): { p: Set<ID>; m: Set<ID> } {
  const s = w.s;
  if (!ids || ids.tick !== s.tick || ids.plants !== s.plants || ids.np !== s.plants.length || ids.mush !== s.mushrooms || ids.nm !== s.mushrooms.length)
    ids = { tick: s.tick, plants: s.plants, np: s.plants.length, mush: s.mushrooms, nm: s.mushrooms.length, p: new Set(s.plants.map((p) => p.id)), m: new Set(s.mushrooms.map((m) => m.id)) };
  return ids;
}

/** Look around: remember fruit plants, mushrooms, water, rocks and the stockpile within vision. */
export function sense(g: Goblin, w: World, radius?: number): void {
  const r = radius ?? visionRadius(g, w);
  for (const p of bushes(w).query(g.pos, r)) {
    if (p.stage === 'mature' || p.stage === 'old') remember(g, w, 'fruit_plant', p.pos, p.fruit, p.id);
    else if (g.memory.some((m) => m.kind === 'fruit_plant' && m.targetId === p.id)) forget(g, 'fruit_plant', p.id);
  }
  // remembered fruit plants in view that no longer exist → forget (seen gone); the current harvest
  // target is left for the action, which shows confusion on arrival
  const tgt = g.activity.action === 'harvest_fruit' ? g.activity.targetId : null, now = present(w), r8 = (r * 0.8) ** 2;
  const near = (m: MemoryEntry) => (m.pos.x - g.pos.x) ** 2 + (m.pos.y - g.pos.y) ** 2 < r8;
  const gone = (m: MemoryEntry) => (m.kind === 'fruit_plant' && m.targetId !== tgt && !now.p.has(m.targetId!) && near(m))
    || (m.kind === 'mushroom' && !now.m.has(m.targetId!) && near(m));
  const best = nearestShoreWithin(w, g.pos, r);
  if (best) remember(g, w, 'water', best);
  // mushrooms that look edible to it are remembered; vanished ones forgotten (redcaps only by those who don't know, P5.5)
  for (const m of w.s.mushrooms)
    if ((m.pos.x - g.pos.x) ** 2 + (m.pos.y - g.pos.y) ** 2 < r * r && looksEdible(g, m)) remember(g, w, 'mushroom', m.pos, 0, m.id);
  if (g.memory.some(gone)) g.memory = g.memory.filter((m) => !gone(m));
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
