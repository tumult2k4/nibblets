/**
 * One decision's searches (P11.3): while `think` scores a goblin's actions, a target search that several steps ask for
 * (isAvailable, then score, then start) is made once. Only while that goblin decides, and only until something is
 * claimed or started (`claimsChanged`), so a remembered answer is always the one a fresh search would give.
 */
import type { Goblin } from '../state';
import type { World } from '../world';
import { claimsVersion } from './claims';

let cur: { w: World; id: number; tick: number; v: number } | null = null;
const vals = new Map<string, unknown>();

/** `think` begins (a goblin) or ends (null) a decision. */
export function deciding(w: World, g: Goblin | null): void {
  vals.clear();
  cur = g ? { w, id: g.id, tick: w.s.tick, v: claimsVersion() } : null;
}

/** `fn()`, remembered under `key` for the rest of this goblin's decision. */
export function once<T>(w: World, g: Goblin, key: string, fn: () => T): T {
  if (!cur || cur.w !== w || cur.id !== g.id || cur.tick !== w.s.tick) return fn();
  const v = claimsVersion();
  if (cur.v !== v) { vals.clear(); cur.v = v; }
  if (vals.has(key)) return vals.get(key) as T;
  const r = fn();
  vals.set(key, r);
  return r;
}

const ticks = new Map<string, { w: World; tick: number; v: unknown }>();
/**
 * `fn()` once a tick (P11.3), for questions about the whole village that only decisions ask: the state they read
 * changes before `think`, not during it, so the answer holds for every goblin deciding this tick.
 */
export function perTick<T>(w: World, key: string, fn: () => T): T {
  const c = ticks.get(key);
  if (c && c.w === w && c.tick === w.s.tick) return c.v as T;
  const v = fn();
  ticks.set(key, { w, tick: w.s.tick, v });
  return v;
}

const shares = new Map<string, { w: World; tick: number; v: number; val: unknown }>();
/**
 * `fn()` shared by every goblin deciding in this `think`, until one of them starts something (P11.3): the village's
 * wants, which only deliveries and starts change. Outside a decision it is asked fresh.
 */
export function shared<T>(w: World, key: string, fn: () => T): T {
  if (!cur || cur.w !== w || cur.tick !== w.s.tick) return fn();
  const v = claimsVersion(), c = shares.get(key);
  if (c && c.w === w && c.tick === w.s.tick && c.v === v) return c.val as T;
  const val = fn();
  shares.set(key, { w, tick: w.s.tick, v, val });
  return val;
}
