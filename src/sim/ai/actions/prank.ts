/**
 * `Prank` (§13.5, P8.3): a mischievous goblin (> 0.6) plays a trick on someone nearby, a rival for choice, once a
 * day at most: jumps out at a sleeper, swipes something from a pocket and hides it a few steps away, slips a mushroom
 * into an empty bed, or daubs an empty hut with berry juice. The prankster's fun soars; the victim (if it is not a
 * joker itself) is put out and thinks less of it. A mushroom or a painted wall is only found when the owner gets home.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { Vec2 } from '../../../shared/types';
import type { Building, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { isSleeping } from '../../goblin/goblin';
import { opinionOf } from '../../goblin/social';
import { workSpot } from '../../buildings';
import { tileAt } from '../../grid';
import { isFood } from '../../items';
import { takeOne } from '../../inventory';
import { spawnGroundItem } from '../../groundItems';
import { openHomes, prankLanded, resting } from '../../mischief';
import { reach } from './kindness';
import { homeOf } from './home';

const P = CFG.mischief.prank, DAY = CFG.time.dayTicks;
export const PRANKS = ['scare_sleeper', 'hide_item', 'mushroom_bed', 'paint_hut'] as const;
type Kind = (typeof PRANKS)[number];

const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;
const away = (o: Goblin, b: Building): boolean => dist(o.pos, b.pos) > CFG.mischief.theft.ownerAway;
/** a day-to-day whim (no rng: scoring must not change the world) */
const whim = (g: Goblin, o: Goblin, w: World): number => ((g.id * 31 + o.id * 17 + Math.floor(w.s.tick / DAY) * 7) % 11) / 20;

/** What trick suits `o` right now, if any (when several do, the day's whim picks); `open`: its home stands empty. */
function trickFor(g: Goblin, o: Goblin, open: Building | undefined, w: World): Kind | null {
  if (isSleeping(o)) return o.activity.action === 'sleep_ground' ? 'scare_sleeper' : null;
  const fits: Kind[] = o.inventory.some((s) => !isFood(s.type)) ? ['hide_item'] : [];
  if (open) {
    if (!open.data?.mushroom) fits.push('mushroom_bed');
    if (!open.data?.painted || open.data.painted < w.s.tick) fits.push('paint_hut');
  }
  return fits.length ? fits[(g.id + o.id * 3 + Math.floor(w.s.tick / DAY)) % fits.length]! : null;
}

const memo = new WeakMap<Goblin, { tick: number; t: { o: Goblin; kind: Kind } | null }>();

/** The one to prank (it, or its empty hut, close by): a rival for preference, never the very young or the dying. */
export function prankTarget(g: Goblin, w: World): { o: Goblin; kind: Kind } | null {
  const c = memo.get(g);
  if (c && c.tick === w.s.tick) return c.t;
  const near = new Set<Goblin>(w.goblinHash.query(g.pos, P.range).filter((o) => dist(o.pos, g.pos) <= P.range));
  const open = new Map<number, Building>();
  for (const h of openHomes(w)) {
    if (dist(h.pos, g.pos) > P.range) continue;
    for (const id of h.occupants) { const o = w.goblin(id); if (o && o.homeId === h.id) { open.set(id, h); near.add(o); } }
  }
  let best: { o: Goblin; kind: Kind } | null = null, bs = -Infinity;
  for (const o of near) {
    if (o.id === g.id || o.lifeStage === 'egg' || o.lifeStage === 'hatchling' || o.heldByGod || o.airborne || o.health.hp < o.health.maxHp * 0.5) continue;
    const h = open.get(o.id);
    const kind = trickFor(g, o, h, w);
    if (!kind) continue;
    const d = kind === 'mushroom_bed' || kind === 'paint_hut' ? dist(h!.pos, g.pos) : dist(o.pos, g.pos);
    if (d > P.range) continue;
    const sc = (1 - d / P.range) * 0.5 + Math.max(0, -opinionOf(g, o.id) / 100) + whim(g, o, w);
    if (sc > bs) { bs = sc; best = { o, kind }; }
  }
  memo.set(g, { tick: w.s.tick, t: best });
  return best;
}

/** A walkable spot 3–6 steps from `p` to hide a thing at. */
function hidingSpot(w: World, p: Vec2): Vec2 {
  for (let k = 0; k < 8; k++) {
    const a = w.rng.range(0, Math.PI * 2), r = w.rng.range(P.hideDist[0], P.hideDist[1]);
    const q = { x: q4(p.x + Math.cos(a) * r), y: q4(p.y + Math.sin(a) * r) };
    if (tileAt(w.s, q.x, q.y)?.walkable) return q;
  }
  return { ...p };
}

/** The trick itself, once the prankster is in place. */
function pull(g: Goblin, o: Goblin, kind: Kind, w: World): boolean {
  if (kind === 'scare_sleeper') {
    if (!isSleeping(o)) return false;
    o.needs.safety = q4(Math.max(0, o.needs.safety - P.scareSafety));
    o.activity.status = 'done'; // up with a yelp
    w.emit({ type: 'emote', goblinId: o.id, emote: 'exclaim' });
    prankLanded(w, g, o, kind, o.pos, true);
    return true;
  }
  if (kind === 'hide_item') {
    const st = takeOne(o, (s) => !isFood(s.type));
    if (!st) return false;
    spawnGroundItem(w, st, hidingSpot(w, o.pos));
    w.emit({ type: 'emote', goblinId: o.id, emote: 'question' });
    prankLanded(w, g, o, kind, o.pos, true);
    return true;
  }
  const h = homeOf(o, w);
  if (!h || !away(o, h)) return false;
  const d = (h.data ??= {});
  if (kind === 'mushroom_bed') d.mushroom = g.id;
  else { d.painted = w.s.tick + Math.round(P.paintDays * DAY); delete d.paintSeen; }
  prankLanded(w, g, o, kind, h.pos, false);
  return true;
}

export const Prank: UtilityAction = {
  id: 'prank', tags: ['fun'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => g.personality.mischief > P.minMischief && !pressed(g) && !g.heldByGod && !resting(g, w, 'prank_rest') && !!prankTarget(g, w),
  cap: (g) => q4(P.score * (0.6 + 0.4 * (1 - g.needs.fun / 100)) * (g.lifeStage === 'youngling' ? 1.3 : 1)),
  score: (g) => q4(P.score * (0.6 + 0.4 * (1 - g.needs.fun / 100)) * (g.lifeStage === 'youngling' ? 1.3 : 1)),
  start(g, w) {
    const t = prankTarget(g, w);
    if (!t) return false;
    const a = g.activity;
    a.targetId = t.o.id;
    a.count = PRANKS.indexOf(t.kind);
    a.stage = 0;
    a.progress = 0;
    if (t.kind === 'mushroom_bed' || t.kind === 'paint_hut') {
      a.target = workSpot(w.s, homeOf(t.o, w)!, g);
      return planPath(w, g, a.target);
    }
    a.target = { ...t.o.pos };
    return dist(g.pos, t.o.pos) <= 1.1 || planPath(w, g, t.o.pos);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    const kind = PRANKS[a.count ?? 0]!;
    if (!o || o.heldByGod) return 'failed';
    const hut = kind === 'mushroom_bed' || kind === 'paint_hut';
    if (a.stage === 0) {
      if (hut) { if (moveAlong(w, g) !== 'arrived') return 'running'; }
      else {
        const r = reach(g, o, w);
        if (r === null) return 'failed';
        if (!r) return 'running';
      }
      a.stage = 1;
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, hut ? homeOf(o, w)?.pos ?? o.pos : o.pos);
    if (++a.progress < (kind === 'scare_sleeper' ? 15 : P.workTicks)) return 'running';
    return pull(g, o, kind, w) ? 'done' : 'failed';
  },
};
