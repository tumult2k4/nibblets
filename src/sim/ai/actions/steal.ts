/**
 * `Steal` and `Apologize` (§13.5, P8.3). A goblin tempted enough (want of food, greed, mischief, dislike of the
 * owner, less the village's law) takes what is not its own: food from a hut's pantry or a trinket off its shelf while
 * the household is out, or a trinket from a sleeper's pocket. Whoever sees it thinks less of the thief and may spread
 * the word; with a witness the victim learns who did it. A caught thief with a conscience (sociable) comes back
 * later to own up: the thing returned if it still has it, or a gift instead.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { Building, Goblin, Trinket } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { isSleeping } from '../../goblin/goblin';
import { workSpot } from '../../buildings';
import { isFood } from '../../items';
import { addItem, canCarry } from '../../inventory';
import { carried, passTrinket, trinketValue } from '../../trinkets';
import { makeAmends, openHomes, owed, rest, resting, temptable, temptation, theft } from '../../mischief';
import { reach } from './kindness';
import { beliefMul } from '../../superstitions';

const TH = CFG.mischief.theft, A = CFG.mischief.apology, V = CFG.trinkets.value;

type Where = 'pantry' | 'shelf' | 'pocket';
interface Mark { where: Where; victim: Goblin; b: Building | null; t: Trinket | null; tempt: number }

const thirsty = (g: Goblin): boolean => Math.max(needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const ownerOf = (t: Trinket, w: World): Goblin | undefined => w.s.goblins.find((o) => o.trinkets.includes(t.id));
const family = (g: Goblin, b: Building): boolean => g.homeId === b.id || b.occupants.includes(g.id);

const memo = new WeakMap<Goblin, { tick: number; m: Mark | null }>();

/** The most tempting thing to take within reach, if it is tempting enough. */
export function stealMark(g: Goblin, w: World): Mark | null {
  const c = memo.get(g);
  if (c && c.tick === w.s.tick) return c.m;
  let best: Mark | null = null;
  const consider = (m: Mark) => { if (m.tempt >= TH.minTemptation && (!best || m.tempt > best.tempt)) best = m; };
  if (!temptable(g, w)) { memo.set(g, { tick: w.s.tick, m: null }); return null; }
  for (const b of openHomes(w)) {
    if (family(g, b) || dist(b.pos, g.pos) > TH.range) continue;
    const owner = w.goblin(b.ownerId ?? b.occupants[0]!);
    if (owner && g.needs.hunger < 50 && b.storage.some((s) => isFood(s.type) && s.type !== 'apple_core' && s.qty > 0) && canCarry(g, 'apple'))
      consider({ where: 'pantry', victim: owner, b, t: null, tempt: temptation(g, owner, true, w) });
    const t = b.decoration.map((id) => w.s.trinkets.find((x) => x.id === id)).filter((x): x is Trinket => !!x)
      .sort((x, y) => trinketValue(g, y) - trinketValue(g, x))[0];
    const o = t && ownerOf(t, w);
    if (t && o) consider({ where: 'shelf', victim: o, b, t, tempt: temptation(g, o, false, w) + trinketValue(g, t) / V.legendary * 0.2 });
  }
  for (const o of w.goblinHash.query(g.pos, TH.range)) {
    if (o === g || !isSleeping(o) || o.activity.action !== 'sleep_ground' || dist(o.pos, g.pos) > TH.range) continue;
    const t = carried(o, w)[0];
    if (t) consider({ where: 'pocket', victim: o, b: null, t, tempt: temptation(g, o, false, w) + trinketValue(g, t) / V.legendary * 0.2 });
  }
  memo.set(g, { tick: w.s.tick, m: best });
  return best;
}

/** Still there for the taking? */
function stillThere(m: Mark, w: World): boolean {
  if (m.where === 'pocket') return isSleeping(m.victim) && !!m.t && m.victim.trinkets.includes(m.t.id);
  if (!m.b || !openHomes(w).includes(m.b)) return false;
  return m.where === 'pantry' ? m.b.storage.some((s) => isFood(s.type) && s.type !== 'apple_core' && s.qty > 0) : !!m.t && m.b.decoration.includes(m.t.id);
}

/** Take it. */
function take(g: Goblin, m: Mark, w: World, at: Vec2): boolean {
  if (m.where === 'pantry') {
    const st = m.b!.storage.find((s) => isFood(s.type) && s.type !== 'apple_core' && s.qty > 0)!;
    const got = addItem(g, { type: st.type, qty: Math.min(2, st.qty) });
    if (got <= 0) return false;
    st.qty -= got;
    m.b!.storage = m.b!.storage.filter((s) => s.qty > 0);
    theft(w, g, m.victim, st.type, null, at);
    return true;
  }
  passTrinket(w, m.t!, m.victim, g);
  theft(w, g, m.victim, null, m.t, at);
  return true;
}

export const Steal: UtilityAction = {
  id: 'steal', tags: ['fun'], minStage: 'youngling', interruptible: false, // once it has made up its mind, it goes through with it
  isAvailable: (g, w) => !thirsty(g) && !g.heldByGod && !resting(g, w, 'steal_rest') && !!stealMark(g, w),
  score: (g, w) => q4(TH.score * (0.4 + stealMark(g, w)!.tempt) * beliefMul(w, g, 'theft')),
  start(g, w) {
    const m = stealMark(g, w);
    if (!m) return false;
    const a = g.activity;
    a.targetId = m.victim.id;
    a.count = m.b?.id ?? -1;
    a.lesson = m.where + ':' + (m.t?.id ?? -1);
    a.stage = 0;
    a.progress = 0;
    rest(w, g, 'steal_rest', TH.restDays); // tempted or not, the chance has gone by for today
    a.target = m.b ? workSpot(w.s, m.b, g) : { ...m.victim.pos };
    return dist(g.pos, a.target) < 0.5 || planPath(w, g, a.target);
  },
  step(g, w) {
    const a = g.activity;
    const victim = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    const [where, tid] = (a.lesson ?? '').split(':') as [Where, string];
    const b = a.count !== undefined && a.count >= 0 ? w.s.buildings.find((x) => x.id === a.count) ?? null : null;
    const t = w.s.trinkets.find((x) => x.id === Number(tid)) ?? null;
    if (!victim) return 'failed';
    const m: Mark = { where, victim, b, t, tempt: 0 };
    if (!stillThere(m, w)) return 'failed';
    if (a.stage === 0) {
      if (where === 'pocket') {
        const r = reach(g, victim, w);
        if (r === null) return 'failed';
        if (!r) return 'running';
      } else if (moveAlong(w, g) !== 'arrived') return 'running';
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, b?.pos ?? victim.pos);
    if (++a.progress < TH.workTicks) return 'running';
    return take(g, m, w, { ...g.pos }) ? 'done' : 'failed';
  },
};

export const Apologize: UtilityAction = {
  id: 'apologize', tags: ['social'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => {
    const gu = owed(g, w), o = gu && w.goblin(gu.victimId);
    return !!o && !thirsty(g) && !g.heldByGod && !isSleeping(o) && !o.heldByGod && dist(o.pos, g.pos) <= A.range;
  },
  score: (g, w) => (owed(g, w)?.ordered ? A.ordered : q4(A.score * (0.5 + g.personality.sociability))),
  start(g, w) {
    const gu = owed(g, w), o = gu && w.goblin(gu.victimId);
    if (!o) return false;
    g.activity.targetId = o.id;
    g.activity.target = { ...o.pos };
    g.activity.stage = 0;
    g.activity.progress = 0;
    return dist(g.pos, o.pos) <= 1.1 || planPath(w, g, o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    const gu = (g.guilt ?? []).find((x) => x.victimId === a.targetId && x.known && !x.settled);
    if (!o || !gu || isSleeping(o) || o.heldByGod) return 'failed';
    if (a.stage === 0) {
      const r = reach(g, o, w);
      if (r === null) return 'failed';
      if (!r) return 'running';
      a.stage = 1;
      w.emit({ type: 'emote', goblinId: g.id, emote: 'tear' });
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    if (++a.progress < A.talkTicks) return 'running';
    makeAmends(w, g, o, gu);
    w.emit({ type: 'emote', goblinId: o.id, emote: 'heart' });
    return 'done';
  },
};
