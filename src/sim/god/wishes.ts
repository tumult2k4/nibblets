/**
 * Divine wishes (§17.6, P8.9): influence, not control. A wish the god spoke or signed makes the actions that meet it
 * score higher, by CFG.god.wishBonus × its strength (the goblin's obedience when it heard), and frowns on the ones it
 * forbids. Survival comes first: while a need is pressing, wishes wait. A wish is fulfilled when a matching action
 * finishes (or, for "avoid" and "leave alone", when it runs out unbroken): faith and love grow. A defied wish lasts
 * half as long and halves the very actions it asked for.
 */
import { CFG } from '../config';
import { clamp, dist, q4 } from '../../shared/math';
import type { ItemType } from '../../shared/types';
import type { ActionId, DivineWish, Goblin } from '../state';
import type { World } from '../world';
import { needUrgency } from '../goblin/needs';
import { godTemper } from './devotion';
import { GATHER_FOR, KEEP_WISHES, WISH_ACTIONS, WISH_AGAINST } from '../cfg/divine';

const D = CFG.divine, G = CFG.god;

/** §17.6 obedience: faith × the stronger of love and fear × piety less mischief; ×1.2 under a wrathful god. */
export function obedience(g: Goblin, w: World): number {
  const v = g.godView, p = g.personality;
  const wrath = godTemper(w.s) === 'wrathful' ? D.wrathObey : 1;
  return clamp((v.faith / 100) * (0.5 + (0.5 * Math.max(v.love, v.fear)) / 100) * (1 + 0.4 * p.piety - 0.6 * p.mischief) * wrath, 0, 1);
}
/** §17.6 defiance: 0.25 × mischief × (1 − love/100). */
export const defianceChance = (g: Goblin): number => G.defianceBase * g.personality.mischief * (1 - g.godView.love / 100);

/** A need so pressing that wishes wait (a starving goblin eats first, then obeys). */
export const pressed = (g: Goblin): boolean =>
  Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > D.survival;

/** Does doing `id` meet this wish? (gather what: only the actions that bring that in) */
export function meets(x: DivineWish, id: ActionId): boolean {
  if (x.intent === 'gather' && x.target?.kind === 'item') return (GATHER_FOR[x.target.value as ItemType] ?? WISH_ACTIONS.gather!).includes(id);
  return WISH_ACTIONS[x.intent]?.includes(id) ?? false;
}
/** Does doing `id` go against it? (`stop`: whatever it was doing when told) */
export function forbids(x: DivineWish, id: ActionId): boolean {
  if (x.intent === 'stop') return x.target?.kind === 'action' && x.target.value === id;
  return WISH_AGAINST[x.intent]?.includes(id) ?? false;
}

/** An available action's score as the goblin's wishes bend it (a wish lifts it even from 0: the god wants it done). */
export function wishScore(g: Goblin, w: World, id: ActionId, base: number): number {
  const ws = g.godView.wishes;
  if (!ws.length || pressed(g)) return base;
  let b = base, mul = 1;
  for (const x of ws) {
    if (x.expiresTick <= w.s.tick) continue;
    if (x.defied) {
      if (meets(x, id)) mul *= D.defyMul;
      continue;
    }
    if (meets(x, id)) b += G.wishBonus * x.strength;
    if (forbids(x, id)) mul *= 1 - x.strength;
  }
  return b * mul;
}

/** The place a come-here wish calls it to, if it has one it heeds. */
export function calledTo(g: Goblin, w: World): DivineWish | undefined {
  return g.godView.wishes.find((x) => x.intent === 'come_here' && !x.defied && x.expiresTick > w.s.tick && x.target?.pos);
}

export function fulfil(g: Goblin, w: World, x: DivineWish): void {
  const v = g.godView;
  v.faith = q4(Math.min(100, v.faith + D.fulfilled.faith));
  v.love = q4(Math.min(100, v.love + D.fulfilled.love));
  w.emit({ type: 'wish_fulfilled', goblinId: g.id, intent: x.intent, at: { ...g.pos } });
}

/** `id` just finished: the first wish it meets is fulfilled; a keep-wish it breaks is gone. */
export function wishDone(g: Goblin, w: World, id: ActionId): void {
  const ws = g.godView.wishes, now = w.s.tick;
  const i = ws.findIndex((x) => !x.defied && x.expiresTick > now && meets(x, id)
    && (x.intent !== 'come_here' || (!!x.target?.pos && dist(g.pos, x.target.pos) <= D.near)));
  if (i >= 0) fulfil(g, w, ws.splice(i, 1)[0]!);
  for (let j = ws.length - 1; j >= 0; j--) if (KEEP_WISHES.includes(ws[j]!.intent) && forbids(ws[j]!, id)) ws.splice(j, 1);
}

/** Every 30 ticks: wishes run out; a keep-wish that ran out unbroken was kept. */
export function updateWishes(w: World): void {
  const now = w.s.tick;
  if (now % 30 !== 0) return;
  for (const g of w.s.goblins) {
    const ws = g.godView.wishes;
    if (!ws.length || ws.every((x) => x.expiresTick > now)) continue;
    g.godView.wishes = ws.filter((x) => {
      if (x.expiresTick > now) return true;
      if (!x.defied && KEEP_WISHES.includes(x.intent)) fulfil(g, w, x);
      return false;
    });
  }
}
