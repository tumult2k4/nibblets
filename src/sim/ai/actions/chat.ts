/**
 * `Chat` (§13.2, P5.1): a goblin wanting company walks up to someone free nearby (rivals refuse), the two face each
 * other and trade 4–6 lines on one topic, shown as icon bubbles. The topic comes from what is on their minds: the
 * weather, food, danger, gossip (the speaker shares its most useful memories, stale ones included), someone they both
 * know, a place, the recently dead, or a complaint. Both gain social and opinion (+2..+5, more if the topic suits the
 * listener). The listener's side runs as the same action in `stage` 2.
 */
import { CFG } from '../../config';
import { dist, q4 } from '../../../shared/math';
import type { ChatTopic } from '../../../shared/types';
import type { ActionId, Goblin } from '../../state';
import type { World } from '../../world';
import type { UtilityAction } from '../action';
import { faceToward, moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { remember } from '../../goblin/memory';
import { addSocial, adjustOpinion, isKin, mutual, opinionOf, relationOf } from '../../goblin/social';
import { weatherAt } from '../../weather';
import { airAt } from '../../temperature';
import { dangerAt } from '../../danger';
import { heardOfTheft } from '../../mischief';

const S = CFG.social;
const DAY = CFG.time.dayTicks;
/** What a goblin can be pulled away from to listen. */
const FREE: ReadonlySet<ActionId> = new Set(['idle', 'wander', 'warm_up']);
/** P8.3: who was seen stealing travels too (hearsay) */
const SHAREABLE = new Set(['fruit_plant', 'water', 'rock', 'mushroom', 'place', 'thief']);

const awake = (g: Goblin): boolean => !g.heldByGod && !g.airborne && g.activity.action !== 'sleep_home' && g.activity.action !== 'sleep_ground';
const pressed = (g: Goblin): boolean => Math.max(needUrgency(g.needs.hunger), needUrgency(g.needs.thirst), needUrgency(g.needs.energy)) > 0.5;

/** Can `o` be drawn into a chat right now? */
function free(o: Goblin): boolean {
  if (!awake(o) || o.lifeStage === 'egg' || o.lifeStage === 'hatchling' || pressed(o) || o.needs.social > 97) return false;
  return o.activity.status !== 'running' || FREE.has(o.activity.action);
}

/** Best partner within reach: friends and family first, then whoever is closest. Rivals and enemies refuse. */
export function chatPartner(g: Goblin, w: World): Goblin | null {
  let best: Goblin | null = null, bs = -Infinity;
  for (const o of w.goblinHash.query(g.pos, S.chatRange)) {
    if (o.id === g.id || !free(o)) continue;
    const d = dist(o.pos, g.pos);
    if (d > S.chatRange || opinionOf(g, o.id) <= S.rival || opinionOf(o, g.id) <= S.rival) continue;
    const r = relationOf(g, o.id);
    const sc = (r?.opinion ?? 0) * 0.02 + (r?.familiarity ?? 0) * 0.005 + (isKin(g, o) ? 0.3 : 0) + (1 - d / S.chatRange);
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

/** Memories `g` knows and `o` doesn't, most useful (confident) first. */
function news(g: Goblin, o: Goblin): Goblin['memory'] {
  return g.memory
    .filter((m) => SHAREABLE.has(m.kind) && m.confidence > 0.3 && !(m.kind === 'thief' && m.targetId === o.id) && !o.memory.some((x) => x.kind === m.kind && (m.targetId !== undefined ? x.targetId === m.targetId : dist(x.pos, m.pos) < CFG.memory.mergeDist)))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, S.gossipShare);
}

/** Someone both know whom `g` feels strongly about. */
function person(g: Goblin, o: Goblin, w: World): Goblin | undefined {
  const r = g.relationships.filter((x) => x.targetId !== o.id && Math.abs(x.opinion) >= S.friend && relationOf(o, x.targetId));
  r.sort((a, b) => Math.abs(b.opinion) - Math.abs(a.opinion));
  return r[0] ? w.goblin(r[0].targetId) : undefined;
}

const recentDead = (g: Goblin, w: World) =>
  w.s.graves.filter((gr) => w.s.tick - gr.tick < 4 * DAY && (relationOf(g, gr.goblinId)?.familiarity ?? 0) > 10);

/** Weighted pick of what's on `g`'s mind (§13.2). */
export function pickTopic(g: Goblin, o: Goblin, w: World): ChatTopic {
  const k = weatherAt(w, g.pos);
  const wx: [ChatTopic, number][] = [
    ['weather', k === 'clear' || k === 'cloudy' ? (Math.abs(airAt(w, g.pos) - 15) > 12 ? 1.5 : 0.5) : 2],
    ['food', (g.needs.hunger < 50 || o.needs.hunger < 50 ? 1.5 : 0.4) + g.personality.gluttony],
    ['danger', w.s.threat.marks.some((m) => w.s.tick - m.tick < 2 * DAY) || dangerAt(w, g.pos) > 0.3 ? 2 : 0],
    ['gossip', news(g, o).length ? 1 + g.personality.sociability : 0],
    ['a_person', person(g, o, w) ? 1 : 0],
    ['a_place', g.memory.some((m) => m.kind === 'place') ? 0.4 + g.personality.wanderlust : 0],
    ['the_dead', recentDead(g, w).length ? 2.5 : 0],
    ['complaint', g.mood.value < -20 ? 1.5 : 0],
    ['trinkets', g.trinkets.length ? 0.6 : 0],
  ];
  const total = wx.reduce((a, [, v]) => a + v, 0);
  let x = w.rng.range(0, total);
  for (const [t, v] of wx) if ((x -= v) < 0) return t;
  return 'weather';
}

/** Does the topic suit the listener? (+2 opinion on top) */
function suits(t: ChatTopic, g: Goblin, o: Goblin, w: World): boolean {
  switch (t) {
    case 'food': return o.personality.gluttony > 0.5;
    case 'gossip': case 'a_place': return o.personality.sociability > 0.5 || o.personality.wanderlust > 0.5;
    case 'danger': return o.personality.bravery < 0.4 || o.needs.safety < 60;
    case 'a_person': { const p = person(g, o, w); return !!p && Math.sign(opinionOf(o, p.id)) === Math.sign(opinionOf(g, p.id)); }
    case 'the_dead': return recentDead(o, w).length > 0;
    case 'complaint': return o.mood.value < 0;
    default: return true;
  }
}

/** The conversation's payoff for both (§13.1/§13.2). */
function conclude(g: Goblin, o: Goblin, w: World, t: ChatTopic): void {
  const base = w.rng.int(S.chat[0], S.chat[1]);
  const match = suits(t, g, o, w);
  // elders are listened to: their words count for more (§4.4)
  const respect = g.lifeStage === 'elder' ? CFG.life.elderRespect : 1;
  mutual(w, g, o, base, q4((t === 'complaint' && !match ? 1 : base + (match ? S.topicMatch : 0)) * respect));
  addSocial(g, S.chatSocial);
  addSocial(o, S.chatSocial);
  if (t === 'gossip' || t === 'a_place') {
    // second-hand knowledge: a little less sure, and as stale as the teller's
    for (const m of news(g, o)) {
      remember(o, w, m.kind as Parameters<typeof remember>[2], m.pos, m.data, m.targetId);
      if (m.kind === 'thief') heardOfTheft(w, o, m.targetId!, m.data);
      const got = o.memory.find((x) => x.kind === m.kind && dist(x.pos, m.pos) < 0.01);
      if (got) { got.confidence = q4(m.confidence * S.gossipConfidence); got.lastSeenTick = m.lastSeenTick; }
    }
  } else if (t === 'a_person') {
    const p = person(g, o, w);
    if (p) adjustOpinion(w, o, p, (opinionOf(g, p.id) - opinionOf(o, p.id)) * S.personSway);
  } else if (t === 'the_dead') {
    addMood(w, g, 'shared_grief', 3, DAY / 2);
    addMood(w, o, 'shared_grief', 3, DAY / 2);
  } else if (t === 'complaint' && match) {
    addMood(w, g, 'vented', 3, DAY / 4);
    addMood(w, o, 'vented', 2, DAY / 4);
  }
  w.emit({ type: 'chat', aId: g.id, bId: o.id, topic: t, at: { ...g.pos } });
}

/** Pull `o` into a conversation with `g` as the listener. */
function invite(o: Goblin, g: Goblin, w: World): void {
  o.activity = { action: 'chat', status: 'running', startedTick: w.s.tick, targetId: g.id, target: null, path: [], progress: 0, stage: 2 };
  o.velocity = { x: 0, y: 0 };
  o.lastDecisionTick = w.s.tick;
}

export const Chat: UtilityAction = {
  id: 'chat', tags: ['social'], minStage: 'youngling', interruptible: (g) => g.activity.stage === 0,
  isAvailable: (g, w) => g.needs.social < 90 && !pressed(g) && !!chatPartner(g, w),
  score: (g) => 0.05 + 0.8 * needUrgency(g.needs.social),
  start(g, w) {
    const o = chatPartner(g, w);
    if (!o) return false;
    const d = Math.max(0.01, dist(g.pos, o.pos));
    const spot = { x: q4(o.pos.x + ((g.pos.x - o.pos.x) / d) * 0.9), y: q4(o.pos.y + ((g.pos.y - o.pos.y) / d) * 0.9) };
    g.activity.targetId = o.id;
    g.activity.stage = 0;
    invite(o, g, w);
    return d < 1.3 || planPath(w, g, spot);
  },
  step(g, w) {
    const a = g.activity;
    const o = a.targetId !== null ? w.goblin(a.targetId) : undefined;
    if (!o || o.activity.action !== 'chat' || o.activity.targetId !== g.id) return a.stage === 2 ? 'done' : 'failed';
    if (a.stage === 2) { // listening: face the speaker and wait for it to finish
      g.velocity = { x: 0, y: 0 };
      faceToward(g, o.pos);
      return w.s.tick - a.startedTick > S.lineTicks * 12 + 300 ? 'done' : 'running';
    }
    if (a.stage === 0) {
      if (dist(g.pos, o.pos) > 1.3 && moveAlong(w, g) !== 'arrived') {
        return w.s.tick - a.startedTick > 300 ? 'failed' : 'running';
      }
      a.stage = 1;
      a.progress = 0;
      a.topic = pickTopic(g, o, w);
      a.count = w.rng.int(S.chatLines[0], S.chatLines[1]);
    }
    g.velocity = { x: 0, y: 0 };
    faceToward(g, o.pos);
    faceToward(o, g.pos);
    const line = Math.floor(a.progress / S.lineTicks);
    if (a.progress % S.lineTicks === 0 && line < a.count!) w.emit({ type: 'chat_line', goblinId: line % 2 ? o.id : g.id, topic: a.topic!, at: { ...g.pos } });
    if (++a.progress < a.count! * S.lineTicks) return 'running';
    conclude(g, o, w, a.topic!);
    o.activity.status = 'done';
    return 'done';
  },
};
