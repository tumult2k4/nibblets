/**
 * The god speaks (§17.7, P8.9): `divine_speech`, from the Sign wheel now and from the Voice (P9.7) later, the same
 * command either way. Whoever hears it (the addressees, and bystanders within 8 tiles of a lone one) gains faith,
 * more the first time, and feels its tone; they look up, the fearful kneel, the loving dance, skeptics shrug. Each
 * addressee takes the intents as wishes as strong as its obedience, unless it defies them and shakes a fist at the
 * sky. A build wish marks out the building if none is waiting and gives the obedient a plan to build it; "stop" cuts
 * what the goblin was doing; "avoid" makes a place the addressees keep out of.
 */
import { CFG } from '../config';
import { q2, q4 } from '../../shared/math';
import type { BuildingType, ID, ItemType, ParsedIntent, Tone, Vec2, WishTarget } from '../../shared/types';
import type { DivineWish, Goblin } from '../state';
import type { World } from '../world';
import { allocId } from '../../shared/ids';
import { isComplete, placeBlueprint } from '../buildings';
import { RECIPES } from '../recipes';
import { pushGoal } from '../ai/planner';
import { ACTIONS, forceAction, startAction } from '../ai/utility';
import { siteFor } from '../ai/actions/village';
import { GATHER_FOR, WISH_INTENTS } from '../cfg/divine';
import { defianceChance, fulfil, obedience, pressed } from './wishes';
import { pay, speechCost, speechTier, afford } from './tiers';
import { addZone } from './zones';
import { learn } from '../knowledge';

const D = CFG.divine, G = CFG.god;

export interface Speech { addressees: ID[] | 'all'; tone: Tone; intents: ParsedIntent[]; isQuestion: boolean; source: 'voice' | 'sign' }

/** Building types a build wish may name: those built on a site whose recipe someone in the village knows. */
export function wishBuildings(w: World): BuildingType[] {
  const out: BuildingType[] = [];
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.station !== 'site' || !r.building || out.includes(r.building)) continue;
    if (r.known || w.s.goblins.some((g) => g.knownRecipes.includes(id))) out.push(r.building);
  }
  return out;
}

function targetProblem(w: World, x: ParsedIntent): string | null {
  const t = x.target, s = w.s;
  const oob = (p: Vec2) => p.x < 0 || p.y < 0 || p.x >= s.size.w || p.y >= s.size.h;
  if (x.intent === 'come_here' || x.intent === 'avoid') return t?.pos && !oob(t.pos) ? null : 'bad_target';
  if (!t) return null;
  if (t.pos && oob(t.pos)) return 'bad_target';
  if (t.kind === 'item') return x.intent === 'gather' && GATHER_FOR[t.value as ItemType] ? null : 'bad_target';
  if (t.kind === 'entity') return typeof t.value === 'number' && w.goblin(t.value) ? null : 'missing_entity';
  if (t.kind === 'building') {
    if (x.intent !== 'build') return 'bad_target';
    if (typeof t.value === 'number') return s.buildings.some((b) => b.id === t.value && !isComplete(b)) ? null : 'missing_entity';
    return wishBuildings(w).includes(t.value as BuildingType) ? null : 'unknown_recipe';
  }
  return t.kind === 'pos' || t.kind === 'place' ? null : 'bad_target';
}

/** Why the god may not say this now, or null. */
export function speechProblem(w: World, c: Speech): string | null {
  const to = c.addressees;
  if (to !== 'all' && (!to.length || to.length > 60 || to.some((id) => !w.goblin(id)))) return 'missing_entity';
  if (c.intents.length > D.maxIntents) return 'too_many';
  for (const x of c.intents) {
    if (!WISH_INTENTS.includes(x.intent)) return 'unknown_intent';
    const why = targetProblem(w, x);
    if (why) return why;
  }
  return afford(w, speechTier(c.source, c.addressees), speechCost(w, c.addressees));
}

/** Quantized for the log (spots to 0.01). */
export const quantizeSpeech = (c: ParsedIntent[]): ParsedIntent[] =>
  c.map((x) => (x.target?.pos ? { ...x, target: { ...x.target, pos: { x: q2(x.target.pos.x), y: q2(x.target.pos.y) } } } : x));

const clamp100 = (n: number) => q4(Math.max(0, Math.min(100, n)));

/** One goblin hears the god: faith (more the first time ever), the tone's love, fear and fun, and it looks up. */
function hear(w: World, g: Goblin, tone: Tone): void {
  const v = g.godView, tn = D.tone[tone];
  const first = v.lastVoiceTick < 0;
  v.faith = clamp100(v.faith + (first ? D.heard.first : D.heard.faith) + tn.faith);
  v.love = clamp100(v.love + tn.love);
  v.fear = clamp100(v.fear + tn.fear);
  if (tn.fun) g.needs.fun = clamp100(g.needs.fun + tn.fun);
  v.lastVoiceTick = v.seenTick = w.s.tick;
  if (first) w.emit({ type: 'first_voice', goblinId: g.id, at: { ...g.pos } });
  if (g.heldByGod || g.airborne) return;
  if (!ACTIONS[g.activity.action].forced) forceAction(g, w, 'look_up', { x: g.pos.x, y: g.pos.y - 1 });
  const emote = v.fear > D.kneel ? 'pray' : v.love > D.dance ? 'heart' : v.faith < G.skepticFaith ? 'question' : null;
  if (emote) w.emit({ type: 'emote', goblinId: g.id, emote });
}

/** The building a build wish is about: the blueprint named, one already waiting, or a new one marked out. */
function blueprintFor(w: World, t: WishTarget | undefined): ID | null {
  if (!t || t.kind !== 'building') return null;
  if (typeof t.value === 'number') return t.value;
  const type = t.value as BuildingType;
  const open = w.s.buildings.find((b) => b.type === type && !isComplete(b));
  if (open) return open.id;
  const site = siteFor(w, type);
  return site ? placeBlueprint(w, type, site, null).id : null;
}

/** An addressee takes one intent to heart, or defies it. */
function takeWish(w: World, g: Goblin, x: ParsedIntent, source: Speech['source'], was: string, build: () => ID | null): DivineWish {
  const s = w.s, dur = G.wishTicks[source];
  const defied = w.rng.chance(defianceChance(g));
  const wish: DivineWish = {
    id: allocId(s), intent: x.intent, issuedTick: s.tick, expiresTick: s.tick + Math.round(defied ? dur * D.defyShare : dur),
    strength: q4(obedience(g, w)), source, ...(x.target ? { target: { ...x.target } } : {}), ...(defied ? { defied: true } : {}),
  };
  const ws = g.godView.wishes;
  ws.push(wish);
  while (ws.length > G.maxWishes) ws.shift();
  if (defied) {
    w.emit({ type: 'wish_defied', goblinId: g.id, intent: x.intent, at: { ...g.pos } });
    if (g.lifeStage !== 'hatchling' && !g.heldByGod && !g.airborne && !pressed(g)) startAction(g, w, 'shake_fist');
    return wish;
  }
  if (x.intent === 'stop') {
    wish.target = { kind: 'action', value: was };
    fulfil(g, w, wish);
  }
  // a wish for worship where nothing stands to pray at may bring the shrine to mind (strength = chance)
  if (x.intent === 'worship' && !g.knownRecipes.includes('shrine') && !s.buildings.some((b) => b.type === 'shrine' || b.type === 'temple') && w.rng.chance(wish.strength))
    learn(w, g, 'shrine', 'discovery');
  if (x.intent === 'build' && wish.strength >= D.goalStrength) {
    const id = build();
    if (id !== null) {
      pushGoal(g, w, { kind: 'build', buildingId: id });
      wish.target = { kind: 'building', value: id };
    }
  }
  return wish;
}

export function applySpeech(w: World, c: Speech): void {
  const s = w.s;
  pay(w, speechCost(w, c.addressees));
  const to = c.addressees === 'all' ? [...s.goblins] : c.addressees.map((id) => w.goblin(id)!).filter(Boolean);
  const hearers = new Map(to.map((g) => [g.id, g]));
  if (to.length === 1) for (const o of w.goblinHash.query(to[0]!.pos, G.overhearRadius)) hearers.set(o.id, o);
  const was = new Map(to.map((g) => [g.id, g.activity.action]));
  for (const g of hearers.values()) hear(w, g, c.tone);
  let bp: ID | null | undefined;
  const build = (t: WishTarget | undefined) => () => (bp === undefined ? (bp = blueprintFor(w, t)) : bp);
  const shun: ID[] = [];
  for (const g of to) for (const x of c.intents) {
    const wish = takeWish(w, g, x, c.source, was.get(g.id) ?? 'idle', build(x.target));
    if (x.intent === 'avoid' && !wish.defied) shun.push(g.id);
  }
  const avoid = c.intents.find((x) => x.intent === 'avoid');
  if (shun.length && avoid?.target?.pos) addZone(w, 'shun', avoid.target.pos, D.avoidR, G.wishTicks[c.source], shun);
  w.emit({ type: 'god_spoke', addressees: to.map((g) => g.id), tone: c.tone, intents: c.intents.map((x) => x.intent), source: c.source, ...(to[0] ? { at: { ...to[0].pos } } : {}) });
}
