/**
 * Divine mode progression (§17.9, P8.9). The village's faith earns tiers: each needs what the one below it needs and
 * more (believers, a shrine, a temple, the average faith). Checked hourly; a tier earned unlocks at once, one lost
 * locks again only after CFG.divine.relockHours (cooldowns are kept). Also here: what a gift, a brush stroke and the
 * voice cost and need in Divine mode (Sandbox is free, Observer may not act).
 */
import { CFG } from '../config';
import type { ID, ItemType, Vec2 } from '../../shared/types';
import type { World } from '../world';
import { isComplete } from '../buildings';
import { ITEM_DEFS } from '../items';
import { believers } from './favor';
import { shamanOf } from './shaman';
import { POWER_DEFS, type PowerDef } from './powerDefs';
import type { TierReq } from '../cfg/divine';

const D = CFG.divine, G = CFG.god;
export const MAX_TIER = D.tiers.length - 1;

export const avgFaith = (w: World): number => (w.s.goblins.length ? w.s.goblins.reduce((a, g) => a + g.godView.faith, 0) / w.s.goblins.length : 0);
const has = (w: World, type: 'shrine' | 'temple'): boolean => w.s.buildings.some((b) => b.type === type && isComplete(b));

/** What tier `n` needs, its own needs and those below it together. */
export function tierReq(n: number): TierReq {
  const r: { believers?: number; shrine?: boolean; temple?: boolean; faith?: number } = {};
  for (const t of D.tiers.slice(1, n + 1)) {
    if (t.believers !== undefined) r.believers = Math.max(r.believers ?? 0, t.believers);
    if (t.faith !== undefined) r.faith = Math.max(r.faith ?? 0, t.faith);
    if (t.shrine) r.shrine = true;
    if (t.temple) r.temple = true;
  }
  return r;
}

export interface TierNeed { kind: 'believers' | 'shrine' | 'temple' | 'faith'; have: number; need: number }
/** Each of tier `n`'s needs, with where the village stands. */
export function tierNeeds(w: World, n: number): TierNeed[] {
  const r = tierReq(n), out: TierNeed[] = [];
  if (r.believers) out.push({ kind: 'believers', have: believers(w), need: r.believers });
  if (r.shrine) out.push({ kind: 'shrine', have: has(w, 'shrine') || has(w, 'temple') ? 1 : 0, need: 1 });
  if (r.temple) out.push({ kind: 'temple', have: has(w, 'temple') ? 1 : 0, need: 1 });
  if (r.faith) out.push({ kind: 'faith', have: Math.round(avgFaith(w)), need: r.faith });
  return out;
}
const met = (w: World, n: number): boolean => tierNeeds(w, n).every((x) => x.have >= x.need);

/** The highest tier the village's faith earns now. */
export function earnedTier(w: World): number {
  let t = 0;
  while (t < MAX_TIER && met(w, t + 1)) t++;
  return t;
}

/** Powers that unlock at exactly tier `n` (for the toast). */
export const powersOfTier = (n: number): PowerDef[] => POWER_DEFS.filter((p) => p.tier === n && p.id !== 'gift_tray');

/** Hourly in Divine mode: unlock what is earned, lock again what has been lost for a while. */
export function updateTier(w: World): void {
  const s = w.s, g = s.god;
  if (g.mode !== 'divine' || s.tick % G.hourTicks !== 0) return;
  const t = earnedTier(w);
  if (t >= g.tier) delete g.tierLowSince;
  if (t > g.tier) {
    w.emit({ type: 'tier_changed', tier: t, from: g.tier });
    g.tier = t;
    return;
  }
  if (t === g.tier) return;
  g.tierLowSince ??= s.tick;
  if (s.tick - g.tierLowSince < D.relockHours * G.hourTicks) return;
  w.emit({ type: 'tier_changed', tier: t, from: g.tier });
  g.tier = t;
  delete g.tierLowSince;
}

/** Divine mode only: take favor for an act (Sandbox and Observer pay nothing). */
export function pay(w: World, n: number): void {
  if (w.s.god.mode === 'divine') w.s.god.favor = Math.max(0, w.s.god.favor - n);
}
/** Why Divine mode will not take this, or null (Sandbox: always null). */
export function afford(w: World, tier: number, cost: number): string | null {
  const g = w.s.god;
  if (g.mode !== 'divine') return null;
  if (g.tier < tier) return 'locked';
  return g.favor < cost ? 'no_favor' : null;
}

/** The tier a Gift Tray item needs: apples, wood and stone from the start, other food, materials and life at 1, tools at 2. */
export function giftTier(item: ItemType): number {
  if (D.giftTier0.includes(item)) return 0;
  return ITEM_DEFS[item]?.tray === 'tools' ? D.toolsTier : D.giftTier;
}
export const giftCost = (item: ItemType, qty: number): number => (ITEM_DEFS[item]?.value ?? 1) * qty;

/** A brush stroke tick: per-tile price × tiles under the brush × CFG.divine.strokeShare; a rock is a flat price. */
export function strokeCost(w: World, def: PowerDef, pos: Vec2, radius: number): number {
  if (!def.costPerTile) return def.cost;
  const r = Math.max(1, Math.min(CFG.terraform.maxRadius, radius));
  let n = 0;
  for (let y = Math.floor(pos.y - r); y <= Math.ceil(pos.y + r); y++)
    for (let x = Math.floor(pos.x - r); x <= Math.ceil(pos.x + r); x++)
      if (x >= 0 && y >= 0 && x < w.s.size.w && y < w.s.size.h && Math.hypot(x + 0.5 - pos.x, y + 0.5 - pos.y) <= r) n++;
  return Math.round(def.costPerTile * n * D.strokeShare * 100) / 100;
}

/** §17.7.2: one goblin, a group or everyone; a proclamation costs 40 % less while a shaman lives. */
export function speechCost(w: World, to: ID[] | 'all'): number {
  const c = G.voiceCost;
  if (to === 'all') return c.all * (shamanOf(w) ? 1 - G.shamanVoiceDiscount : 1);
  return to.length > 1 ? c.group : c.single;
}
/** §17.9: signs to one goblin from tier 0, the voice from tier 1; a group from tier 2; everyone from tier 3. */
export function speechTier(source: 'voice' | 'sign', to: ID[] | 'all'): number {
  if (to === 'all') return D.allTier;
  if (to.length > 1) return D.groupTier;
  return source === 'voice' ? D.voiceTier : 0;
}
