/**
 * Who is doing what to what (P11.3): an index of the goblins' current actions by action and target, so "is anyone
 * else already chopping this tree?" is a lookup, not a pass over every goblin for every tree. Rebuilt on the first
 * question after a goblin starts something new (`claimsChanged`) or a new tick, so it answers as the goblins stand
 * then: deterministic, since the same starts happen in the same order on every run and after a load.
 */
import type { ActionId, Goblin } from '../state';
import type { World } from '../world';

interface Claim { id: number; running: boolean }
let world: World | null = null, tick = -1, seen = -1, version = 0;
const index = new Map<ActionId, Map<number, Claim[]>>();

/** A goblin started (or dropped) an action: the index is out of date. */
export const claimsChanged = (): void => { version++; };
export const claimsVersion = (): number => version;

function rebuild(w: World): void {
  index.clear();
  for (const o of w.s.goblins) {
    const a = o.activity;
    if (a.targetId === null) continue;
    let m = index.get(a.action);
    if (!m) index.set(a.action, (m = new Map()));
    let l = m.get(a.targetId);
    if (!l) m.set(a.targetId, (l = []));
    l.push({ id: o.id, running: a.status === 'running' });
  }
  world = w; tick = w.s.tick; seen = version;
}

/** The goblins (ids) doing `action` to `targetId`, running only if `running`. */
export function claimers(w: World, action: ActionId, targetId: number, running = false): number[] {
  if (w !== world || w.s.tick !== tick || seen !== version) rebuild(w);
  const l = index.get(action)?.get(targetId);
  return l ? l.filter((c) => !running || c.running).map((c) => c.id) : [];
}

/** How many goblins but `except` are doing `action` to `targetId` (running only if `running`); no lists made. */
export function claimCount(w: World, action: ActionId, targetId: number, except: number, running = false): number {
  if (w !== world || w.s.tick !== tick || seen !== version) rebuild(w);
  const l = index.get(action)?.get(targetId);
  if (!l) return 0;
  let n = 0;
  for (const c of l) if (c.id !== except && (!running || c.running)) n++;
  return n;
}

/** Is any goblin but `g` doing `action` to `targetId`? */
export const claimedByOther = (w: World, g: Goblin, action: ActionId, targetId: number, running = false): boolean =>
  claimCount(w, action, targetId, g.id, running) > 0;
