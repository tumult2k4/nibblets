/**
 * Word of the god (§17.4, §7.8, P8.8). A divine act someone saw lives on as news for two days: whoever saw it knows
 * it, and in a chat's gossip a goblin who knows tells one who doesn't. The listener feels half of what a witness
 * felt (a mischievous teller makes it a fifth bigger); a skeptic still shrugs off the good of it. Acts nobody saw
 * are never talked about: they look like nature.
 */
import { CFG } from '../config';
import { dist, q4 } from '../../shared/math';
import type { ID, Vec2 } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';
import { applyReaction, reactionFor, type Reaction } from './reactions';
import { faithOf, type DivineNews } from './faithState';

const N = CFG.faith.news, DAY = CFG.time.dayTicks;

/** An act was witnessed by `ids`: the village may talk of it (the same act again soon nearby joins the old news). */
export function noteNews(w: World, act: string, at: Vec2, ids: readonly ID[], reaction?: Reaction): void {
  if (!ids.length || (reaction?.faith ?? reactionFor(act, w.goblin(ids[0]!)!, false).faith ?? 0) < N.minFaith) return;
  const fs = faithOf(w.s), now = w.s.tick;
  const same = fs.news.find((n) => n.act === act && now - n.tick < CFG.god.hourTicks && dist(n.at, at) < 8);
  if (same) {
    for (const id of ids) if (!same.knowers.includes(id)) same.knowers.push(id);
    return;
  }
  fs.news.push({ act, tick: now, at: { x: at.x, y: at.y }, knowers: [...ids], ...(reaction ? { reaction } : {}) });
  fs.news = fs.news.filter((n) => now - n.tick < N.days * DAY).slice(-N.keep);
}

/** The freshest news `g` could tell `o`. */
export function godNews(w: World, g: Goblin, o: Goblin): DivineNews | undefined {
  const fs = w.s.god.faith;
  if (!fs) return undefined;
  for (let i = fs.news.length - 1; i >= 0; i--) {
    const n = fs.news[i]!;
    if (w.s.tick - n.tick >= N.days * DAY) break;
    if (n.knowers.includes(g.id) && !n.knowers.includes(o.id)) return n;
  }
  return undefined;
}

/** `g` tells `o` of the god's latest doing (gossip): half the effect, more from a fibber. True if it had news. */
export function tellOfGod(w: World, g: Goblin, o: Goblin): boolean {
  const n = godNews(w, g, o);
  if (!n) return false;
  n.knowers.push(o.id);
  const r = n.reaction ?? reactionFor(n.act, o, false);
  const k = CFG.god.gossipFactor * (g.personality.mischief > N.liar ? 1 + N.exaggerate : 1);
  const scaled = (x?: number): number | undefined => (x ? q4(x * k) : undefined);
  const out: Reaction = {};
  const f = scaled(r.faith), l = scaled(r.love), fe = scaled(r.fear);
  if (f) out.faith = f;
  if (l) out.love = l;
  if (fe) out.fear = fe;
  applyReaction(o, out);
  o.godView.seenTick = w.s.tick;
  return true;
}
