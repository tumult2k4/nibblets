/**
 * Possess (Sandbox only, §17, P11.1): the player takes one goblin over. Its own thinking stops (`think` skips it);
 * what it does comes from the player's clicks, as `possessed_act` sandbox ops that start ordinary actions from the
 * catalog on the clicked thing — walk there, pick it up, pick the fruit, chop it, fight it — so
 * replays hold. Its eyes glow gold. Let go, it remembers being possessed and feels odd for a day ("I was not myself").
 */
import { CFG } from './config';
import type { ID, Vec2 } from '../shared/types';
import type { Goblin } from './state';
import type { World } from './world';
import { planPath } from './steering';
import { addMood } from './goblin/mood';
import { remember } from './goblin/memory';
import { engageStart } from './ai/actions/fight';

export const POSSESS_ACTS = ['walk', 'pick_up', 'harvest_fruit', 'chop', 'attack'] as const;
export type PossessAct = (typeof POSSESS_ACTS)[number];

/** The goblin the player has taken over, if any. */
export const possessed = (w: World): Goblin | undefined => (w.s.god.possessedId != null ? w.goblin(w.s.god.possessedId) : undefined);

/** Take `id` over (or let go, with null). Only one at a time; letting one go leaves its mark. */
export function possess(w: World, id: ID | null): void {
  const was = possessed(w);
  if (was && was.id !== id) {
    remember(was, w, 'possessed', was.pos);
    addMood(w, was, 'not_myself', CFG.possess.mood, CFG.possess.moodDays * CFG.time.dayTicks);
    w.emit({ type: 'emote', goblinId: was.id, emote: 'question' });
    was.activity.status = 'done';
  }
  const g = id !== null ? w.goblin(id) : undefined;
  w.s.god.possessedId = g ? g.id : null;
  if (g) g.activity = { ...g.activity, action: 'idle', status: 'done', targetId: null, target: null, path: [], stage: 0, progress: 0 };
}

/** Start `act` on what was clicked (`targetId`, at `pos`). False if it cannot (nothing there, no way there). */
export function possessedAct(w: World, act: PossessAct, pos: Vec2, targetId?: ID): boolean {
  const g = possessed(w);
  if (!g || g.heldByGod || g.airborne) return false;
  const s = w.s;
  // drop what it was doing (and any item it had claimed)
  for (const it of s.groundItems) if (it.reservedBy === g.id) it.reservedBy = null;
  g.activity = { ...g.activity, action: act === 'walk' ? 'possessed_walk' : act, status: 'running', startedTick: s.tick, targetId: targetId ?? null, target: { ...pos }, path: [], stage: 0, progress: 0 };
  let ok: boolean;
  if (act === 'attack') {
    const e = s.enemies.find((x) => x.id === targetId);
    ok = !!e && engageStart(g, w, e);
  } else if (act === 'pick_up') {
    const it = s.groundItems.find((x) => x.id === targetId);
    ok = !!it && !it.airborne && it.reservedBy === null && planPath(w, g, it.pos);
    if (ok) it!.reservedBy = g.id;
  } else if (act === 'harvest_fruit' || act === 'chop') {
    const p = s.plants.find((x) => x.id === targetId);
    ok = !!p && (act === 'chop' || p.fruit > 0) && planPath(w, g, p.pos);
    if (ok) { g.activity.target = { ...p!.pos }; g.activity.count = 0; }
  } else ok = planPath(w, g, pos);
  if (!ok) g.activity.status = 'failed';
  return ok;
}
