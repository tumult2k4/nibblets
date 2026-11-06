/**
 * Prayers asked and answered (§17.4, P8.8). At prayer a goblin asks for what weighs on it most: healing (it, or a
 * sick child of its), protection (Gnashers about), food (hungry, or a bare store in winter), water, warmth, rain in a
 * drought, sun in a storm, a lost thing back (robbed) or revenge on the thief (the mischievous), forgiveness (the
 * guilty, or the pious angry with the god), a child (a mate, no little ones), a mate; or else it gives thanks.
 * A prayer stays open a day. A fitting divine act within 8 tiles answers it (food from the sky near it, or eating
 * some; rain; sun; healing on it or the one prayed for; a strike or a Sanctuary near it; a curse or a strike on the
 * rival...): faith +15, love +10, favor +5, the god's alignment +2, joy. Left unanswered it fades: faith −3, love −2,
 * a sigh. Thanks need no answer (and bring double favor at prayer).
 */
import { CFG } from '../config';
import { clamp, dist, q4 } from '../../shared/math';
import { allocId } from '../../shared/ids';
import type { ID, PrayerKind, SimEventInput, Vec2 } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';
import { addMood } from '../goblin/mood';
import { isSick } from '../disease';
import { foodStores } from '../spoilage';
import { mateOf } from '../goblin/family';
import { isNight } from '../time';
import { applyReaction } from './reactions';
import { faithOf, type Prayer } from './faithState';
import { addFavor } from './favor';

const P = CFG.faith.prayer, G = CFG.god, DAY = CFG.time.dayTicks;

/** Which acts answer which prayers. */
const ANSWER: Record<PrayerKind, readonly string[]> = {
  food: ['gift', 'apple_shower', 'bountiful_growth'], water: ['rain', 'create_water'], rain: ['rain'], sun: ['clear_sky', 'warm_sun'],
  warmth: ['warm_sun'], healing: ['healing_touch'], protection: ['lightning', 'meteor', 'sanctuary', 'swarm'],
  child: ['fertility'], mate: ['blessing', 'fertility'], lost_item: ['shiny_gift', 'gift'], revenge: ['curse', 'lightning', 'swarm', 'plague'],
  forgiveness: ['blessing', 'pet', 'healing_touch', 'shiny_gift', 'inspiration', 'set_down'], thanks: [],
};
/** These must fall on the one praying (or the one it prays for). */
const ON_THEM: ReadonlySet<PrayerKind> = new Set(['healing', 'child', 'mate', 'forgiveness']);

const raidNear = (w: World, p: Vec2): boolean => w.s.enemies.some((e) => dist(e.pos, p) < 30 || dist(e.pos, w.s.village.center) < 30);
const sickChild = (g: Goblin, w: World): Goblin | undefined => w.s.goblins.find((c) => c.parents?.includes(g.id) && isSick(c));
const robbedBy = (g: Goblin): ID | undefined => g.memory.find((m) => m.kind === 'thief' && m.data === g.id)?.targetId;

/** What `g` would pray for now (in despair: what drove it to it, the Gnashers if nothing else). */
export function askFor(g: Goblin, w: World, despair = false): { kind: PrayerKind; targetId?: ID } {
  if (despair) {
    const n = g.needs, low = Math.min(n.hunger, n.thirst, n.warmth);
    if (low < 30) return { kind: low === n.hunger ? 'food' : low === n.thirst ? 'water' : 'warmth' };
  }
  if (isSick(g)) return { kind: 'healing', targetId: g.id };
  const child = sickChild(g, w);
  if (child) return { kind: 'healing', targetId: child.id };
  if (raidNear(w, g.pos) || (despair && w.clock.season !== 'winter')) return { kind: 'protection' };
  if (g.needs.hunger < 30 || (w.clock.season === 'winter' && foodStores(w.s).days < P.famineDays)) return { kind: 'food' };
  if (g.needs.thirst < 30) return { kind: 'water' };
  if (g.needs.warmth < 30) return { kind: 'warmth' };
  if (w.s.climate.drought) return { kind: 'rain' };
  const k = w.s.weather.kind;
  if (k === 'storm' || k === 'blizzard') return { kind: 'sun' };
  if (g.mood.modifiers.some((m) => m.id === 'robbed' && m.expiresTick > w.s.tick)) {
    const thief = robbedBy(g);
    return thief !== undefined && g.personality.mischief > 0.5 ? { kind: 'revenge', targetId: thief } : { kind: 'lost_item' };
  }
  if (g.guilt?.some((x) => !x.settled) || (g.godView.angryAtGod && g.personality.piety > CFG.faith.fist.maxPiety)) return { kind: 'forgiveness' };
  if (g.lifeStage === 'adult') {
    const m = mateOf(g, w);
    if (m && !w.s.goblins.some((c) => c.parents?.includes(g.id))) return { kind: 'child' };
    if (!m) return { kind: 'mate' };
  }
  return { kind: 'thanks' };
}

/** Desperate enough to pray anywhere: a need dire for hours, a sick child, a raid at night, a famine. */
export function desperate(g: Goblin, w: World): boolean {
  const since = g.godView.direSince;
  if (since !== undefined && w.s.tick - since > P.hours * G.hourTicks) return true;
  if (sickChild(g, w)) return true;
  if (isNight(w.clock) && raidNear(w, g.pos)) return true;
  return w.clock.season === 'winter' && g.needs.hunger < 50 && foodStores(w.s).days < P.famineDays;
}

export const openPrayer = (g: Goblin, w: World): Prayer | undefined => w.s.god.faith?.prayers.find((p) => p.goblinId === g.id);

/** `g` has prayed: its prayer stays open a day (one at a time). */
export function offerPrayer(w: World, g: Goblin, desperateNow: boolean): Prayer | null {
  if (openPrayer(g, w)) return null;
  const ask = askFor(g, w, desperateNow), s = w.s;
  const p: Prayer = {
    id: allocId(s), goblinId: g.id, kind: ask.kind, at: { x: g.pos.x, y: g.pos.y }, tick: s.tick, expiresTick: s.tick + G.prayerTicks,
    ...(ask.targetId !== undefined ? { targetId: ask.targetId } : {}), ...(desperateNow ? { desperate: true } : {}),
  };
  faithOf(s).prayers.push(p);
  w.emit({ type: 'prayer', prayerId: p.id, goblinId: g.id, kind: p.kind, ...(p.targetId !== undefined ? { targetId: p.targetId } : {}), ...(desperateNow ? { desperate: true } : {}), at: { ...p.at } });
  return p;
}

function fits(w: World, p: Prayer, g: Goblin, act: string, at: Vec2, targetId: ID | undefined, area: number): boolean {
  if (!ANSWER[p.kind].includes(act)) return false;
  if (ON_THEM.has(p.kind)) {
    const them = [g.id, p.targetId, p.kind === 'child' ? mateOf(g, w)?.id : undefined];
    return targetId !== undefined ? them.includes(targetId) : dist(at, g.pos) <= Math.max(1.5, area);
  }
  if (p.kind === 'revenge') {
    const r = p.targetId !== undefined ? w.goblin(p.targetId) : undefined;
    return !!r && (targetId === r.id || (targetId === undefined && dist(at, r.pos) <= Math.max(2, area)));
  }
  return targetId === g.id || dist(at, g.pos) <= Math.max(G.prayerAnswerRadius, area);
}

function answer(w: World, p: Prayer, g: Goblin, by: string): void {
  const fs = faithOf(w.s);
  fs.prayers = fs.prayers.filter((x) => x !== p);
  p.answeredTick = w.s.tick;
  p.answeredBy = by;
  fs.answered = [...fs.answered, p].slice(-P.recent);
  g.godView.answeredPrayers++;
  applyReaction(g, P.answered);
  g.godView.seenTick = w.s.tick;
  addMood(w, g, 'prayer_answered', 8, 2 * DAY);
  addFavor(w, G.answeredPrayerFavor, 'answered');
  w.s.god.alignment = q4(clamp(w.s.god.alignment + P.alignment, -100, 100));
  w.emit({ type: 'prayer_answered', prayerId: p.id, goblinId: g.id, kind: p.kind, at: { ...g.pos } });
  w.emit({ type: 'emote', goblinId: g.id, emote: 'heart' });
}

/** A divine act happened (faith.ts): does it answer anyone's prayer? */
export function answerPrayers(w: World, act: string, at: Vec2, targetId?: ID, area = 0): void {
  const fs = w.s.god.faith;
  if (!fs?.prayers.length) return;
  for (const p of [...fs.prayers]) {
    const g = w.goblin(p.goblinId);
    if (g && fits(w, p, g, act, at, targetId, area)) answer(w, p, g, act);
  }
}

/** Eating food from the sky answers a prayer for food. */
export function notePrayerEvent(w: World, e: SimEventInput): void {
  if (e.type !== 'item_eaten' || !e.divine || !w.s.god.faith?.prayers.length) return;
  const g = w.goblin(e.goblinId), p = g && openPrayer(g, w);
  if (g && p?.kind === 'food') answer(w, p, g, 'eaten');
}

/** Hourly: prayers left a day unanswered fade (thanks just close). */
export function updatePrayers(w: World): void {
  const s = w.s, fs = s.god.faith;
  if (s.tick % G.hourTicks !== 0 || !fs?.prayers.length) return;
  const goblins = new Set(s.goblins.map((g) => g.id));
  for (const p of fs.prayers) {
    if (p.expiresTick > s.tick || p.kind === 'thanks') continue;
    const g = w.goblin(p.goblinId);
    if (!g) continue;
    g.godView.ignoredPrayers++;
    applyReaction(g, P.ignored);
    w.emit({ type: 'prayer_ignored', prayerId: p.id, goblinId: g.id, kind: p.kind, at: { ...g.pos } });
    w.emit({ type: 'emote', goblinId: g.id, emote: 'sweat' });
  }
  fs.prayers = fs.prayers.filter((p) => p.expiresTick > s.tick && goblins.has(p.goblinId));
}

/** Prayers open now, soonest to expire first (the Prayers panel). */
export const openPrayers = (w: World): Prayer[] => [...(w.s.god.faith?.prayers ?? [])].sort((a, b) => a.expiresTick - b.expiresTick || a.id - b.id);
