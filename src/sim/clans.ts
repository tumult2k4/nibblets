/**
 * Rival clans (§16, P10.1): two or three goblin clans living beyond the map's edges, simulated abstractly every
 * `CFG.clans.every` ticks: how many they are, their food store through the seasons (each season's luck drawn anew),
 * births and deaths, how hunger makes them fierce, raids among themselves, and how they see the village (−100..100,
 * drifting back to where their nature rests; an alliance from 70, broken under 50). Each keeps a small gene pool of its
 * own stock that drifts as it breeds (the village sees its colors), its own random stream (the clans never shift the
 * world's), and its latest news. The village meets them one at a time, after a few days; scouts, traders and raiders
 * walking in are P10.2–P10.3, and they move relations through `shiftRelation`.
 */
import { CFG } from './config';
import { allocId, type IdCounter } from '../shared/ids';
import { clamp } from '../shared/math';
import { Rng } from '../shared/rng';
import type { ID } from '../shared/types';
import type { WorldState } from './state';
import type { World } from './world';
import { clockAt } from './time';
import { founderGenome, type ClanArchetype } from './goblin/genetics/founders';
import { meiosis, type Genome } from './goblin/genetics/genome';
import { makeName } from './goblin/names';
import { clanVisits } from './visitors';
import { sendRaiders, wantsRaid } from './enemies/raider';

const C = CFG.clans, R = C.relation, A = C.aggression, DAY = CFG.time.dayTicks, PER_DAY = DAY / C.every;
const SEASON_TICKS = DAY * CFG.time.daysPerSeason;

export type RivalTrait = 'traders' | 'warlike' | 'farmers' | 'pious' | 'wanderers' | 'crafty';
export type Side = 'n' | 'e' | 's' | 'w';
export type Stance = 'allied' | 'friendly' | 'neutral' | 'wary' | 'hostile';
/** A line of a clan's news: what happened (`contact`, `raided`, `was_raided`, `allied`, `ally_lost`, and the
 * relation moves of P10.2+), with whom, and by how much the relation moved. */
export interface ClanNews { tick: number; kind: string; other?: ID; delta?: number }

export interface RivalClan {
  id: ID; name: string; archetype: ClanArchetype; traits: RivalTrait[];
  /** the edge of the map they live beyond */
  side: Side;
  /** goblins, and how many their land feeds; food in goblin-days; aggression 0–1; relation to the village −100..100 */
  pop: number; land: number; store: number; aggression: number; relation: number; allied: boolean;
  /** this season's luck with food */
  luck: number;
  /** when the village met them (null: not yet), and when it will */
  contact: number | null; contactAt: number;
  pool: Genome[]; rng: number; news: ClanNews[];
  /** P10.2: when its next trader may come; P10.3: its last raid on the village, the chief's last gift */
  nextTrader?: number; lastRaid?: number; lastGift?: number;
}

const STOCKS: ClanArchetype[] = ['moss', 'ember', 'tide', 'plum'];
const SIDES: Side[] = ['n', 'e', 's', 'w'];
const TRAITS: RivalTrait[] = ['traders', 'warlike', 'farmers', 'pious', 'wanderers', 'crafty'];
/** what each stock leans to (§4.3: Ember fighters, sociable Tide, wandering Moss, mischievous Plum) */
const LEAN: Record<string, RivalTrait> = { ember: 'warlike', tide: 'traders', moss: 'wanderers', plum: 'crafty' };

const restAggression = (c: RivalClan): number => A.base + (c.traits.includes('warlike') ? A.warlike : 0);
/** Where a clan's feeling for the village rests: traders warmer, the fierce colder. */
export const restingRelation = (c: RivalClan): number =>
  (c.traits.includes('traders') ? R.traders : 0) + R.perAggression * (c.aggression - A.base);

/** The rival clans of a new world (or of an old save): their own stream, forked from the seed; stocks other than the
 * village's, each from another side. */
export function createRivals(s: IdCounter & Pick<WorldState, 'seed' | 'tick' | 'clans' | 'goblins'>): RivalClan[] {
  const r = new Rng(s.seed).fork('rivals'), mine = s.clans[0]?.archetype;
  const stocks = r.shuffle(STOCKS.filter((a) => a !== mine)).slice(0, r.int(C.count[0], C.count[1]));
  const sides = r.shuffle([...SIDES]), taken = new Set(s.goblins.map((g) => g.name));
  let at = s.tick + Math.round(r.range(C.firstContact[0], C.firstContact[1]) * DAY);
  return stocks.map((arch, i) => {
    if (i) at += Math.round(r.range(C.nextContact[0], C.nextContact[1]) * DAY);
    const own = new Rng(r.int(1, 0x7fffffff)), extra = own.pick(TRAITS.filter((x) => x !== LEAN[arch]));
    const name = makeName(own, taken);
    taken.add(name);
    const c: RivalClan = {
      id: allocId(s), name, archetype: arch, traits: [LEAN[arch]!, extra], side: sides[i % SIDES.length]!,
      pop: own.int(C.pop[0], C.pop[1]), land: own.int(C.land[0], C.land[1]), store: 0, aggression: 0, relation: 0, allied: false, luck: own.range(C.luck[0], C.luck[1]),
      contact: null, contactAt: at, pool: [], rng: 0, news: [],
    };
    c.aggression = restAggression(c);
    c.store = Math.round(c.pop * own.range(C.startStore[0], C.startStore[1]));
    c.relation = Math.round(clamp(restingRelation(c) + own.range(-R.start, R.start), -100, 100));
    c.pool = Array.from({ length: C.pool }, () => founderGenome(own, arch));
    c.rng = own.state;
    return c;
  });
}

/** How a clan stands with the village, in a word. */
export function stanceOf(c: RivalClan): Stance {
  if (c.allied) return 'allied';
  return c.relation >= R.friendly ? 'friendly' : c.relation >= R.wary ? 'neutral' : c.relation > R.hostile ? 'wary' : 'hostile';
}

/** The clans the village has met. */
export const knownRivals = (s: WorldState): RivalClan[] => (s.rivals ?? []).filter((c) => c.contact !== null);

function tell(c: RivalClan, n: ClanNews): void {
  const last = c.news[c.news.length - 1];
  if (last && n.delta !== undefined && last.kind === n.kind && Math.floor(last.tick / DAY) === Math.floor(n.tick / DAY)) {
    last.delta = (last.delta ?? 0) + n.delta; // the same kind of deed on the same day: one line
    return;
  }
  c.news.push(n);
  if (c.news.length > C.newsKept) c.news.splice(0, c.news.length - C.newsKept);
}

/** Move a clan's feeling for the village (P10.2+: trade, raids, gifts, exiles, marriages), with a line of news;
 * an alliance forms or breaks as it crosses the lines. */
export function shiftRelation(w: World, c: RivalClan, delta: number, kind: string): void {
  c.relation = clamp(c.relation + delta, -100, 100);
  tell(c, { tick: w.s.tick, kind, delta });
  alliance(w, c);
}

/** A raider of clan `clanId` fell in the village (P10.3): the clan is one fewer, and hates the village more. */
export function raiderFell(w: World, clanId: ID): void {
  const c = w.s.rivals.find((x) => x.id === clanId);
  if (!c) return;
  c.pop = Math.max(C.popMin, c.pop - 1);
  shiftRelation(w, c, CFG.raids.slain, 'slain');
}

function alliance(w: World, c: RivalClan): void {
  const mine = w.s.clans[0]?.id ?? 0;
  if (!c.allied && c.contact !== null && c.relation >= R.ally) {
    c.allied = true;
    tell(c, { tick: w.s.tick, kind: 'allied' });
    w.emit({ type: 'clan_alliance', clanA: c.id, clanB: mine });
  } else if (c.allied && c.relation < R.allyBreak) {
    c.allied = false;
    tell(c, { tick: w.s.tick, kind: 'ally_lost' });
    w.emit({ type: 'clan_alliance', clanA: c.id, clanB: mine, ended: true });
  }
}

/** A season of a clan, a sixth of a day at a time: food by season, luck and how crowded its land is, births while fed (a child of two of the
 * pool replaces one of it), deaths from age and hunger, hunger making it fierce, its feeling drifting home. */
function tend(c: RivalClan, season: string, r: Rng): void {
  const y = (C.yield[season] ?? 1) * c.luck * (c.traits.includes('farmers') ? C.farmers : 1) * Math.min(1, c.land / c.pop);
  c.store = clamp(c.store + (c.pop * (y - 1)) / PER_DAY, 0, c.pop * C.storeDays);
  if (season !== 'winter' && c.store >= c.pop * C.fedDays && c.pop < C.popCap && r.chance((c.pop * C.birthPerDay) / PER_DAY)) {
    c.pop++;
    const kid = meiosis(r.pick(c.pool), r.pick(c.pool), r);
    c.pool[r.int(0, c.pool.length - 1)] = kid;
  }
  if (c.pop > C.popMin && r.chance((c.pop * (C.deathPerDay + (c.store <= 0 ? C.starvePerDay : 0))) / PER_DAY)) c.pop--;
  c.aggression = c.store < c.pop * C.hungryDays ? Math.min(1, c.aggression + A.hungerUp) : Math.max(restAggression(c), c.aggression - A.calm);
  c.relation += (restingRelation(c) - c.relation) * R.drift;
}

/** A hungry, fierce clan may fall on another: it takes a share of their store, and each side may lose a goblin. */
function raidRival(w: World, c: RivalClan, r: Rng): void {
  const RR = C.rivalRaid, others = (w.s.rivals ?? []).filter((o) => o !== c);
  if (!others.length || c.aggression < RR.fierce || c.store >= c.pop * C.hungryDays || !r.chance(RR.chance)) return;
  const v = r.pick(others), took = v.store * RR.steal;
  v.store -= took;
  c.store += took;
  for (const k of [c, v]) k.pop = Math.max(C.popMin, k.pop - r.int(RR.losses[0], RR.losses[1]));
  tell(c, { tick: w.s.tick, kind: 'raided', other: v.id });
  tell(v, { tick: w.s.tick, kind: 'was_raided', other: c.id });
  w.emit({ type: 'clan_raid', clanA: c.id, clanB: v.id });
}

/** Step 19 of the tick (§6): the clans' lives, and first contact when its day comes. */
export function updateClans(w: World): void {
  const s = w.s;
  if (s.tick % C.every !== 0 || !s.rivals?.length) return;
  const season = clockAt(s.tick).season;
  for (const c of s.rivals) {
    const r = new Rng(c.rng);
    if (s.tick % SEASON_TICKS === 0) c.luck = r.range(C.luck[0], C.luck[1]);
    tend(c, season, r);
    raidRival(w, c, r);
    alliance(w, c);
    c.rng = r.state;
    const met = c.contact === null && s.tick >= c.contactAt;
    if (met) {
      c.contact = s.tick;
      tell(c, { tick: s.tick, kind: 'contact' });
      w.emit({ type: 'clan_contact', clanA: c.id, clanB: s.clans[0]?.id ?? 0 });
    }
    clanVisits(w, c, met); // P10.2: the scout at first contact, traders on their days
    if (wantsRaid(w, c)) sendRaiders(w, c); // P10.3
  }
}
