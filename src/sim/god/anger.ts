/**
 * `angryAtGod` (§17.4, P4.8): when the god hurts (or kills) someone a goblin loves — a parent or child, or anyone it
 * thinks well of (opinion > 50) — and the goblin sees it or is kin, it loses love (−25), gains fear (+20) and a little
 * faith (+4), and stays angry for 8 days or until the god does it a kindness. The pious blame themselves (a sad
 * sigh); the rest shake a fist. Prayer and offerings that anger would change arrive in P5.
 */
import { CFG } from '../config';
import { dist } from '../../shared/math';
import type { Vec2 } from '../../shared/types';
import type { Goblin } from '../state';
import type { World } from '../world';
import { applyReaction, calmAnger } from './faith';
import { addMood } from '../goblin/mood';
import { visionRadius } from '../ai/considerations';
import { isSleeping } from '../goblin/goblin';

const PW = CFG.powers;

const isKin = (a: Goblin, b: Goblin): boolean => !!a.parents?.includes(b.id) || !!b.parents?.includes(a.id);
const loves = (g: Goblin, v: Goblin): boolean => isKin(g, v) || g.relationships.some((r) => r.targetId === v.id && r.opinion > 50);

/** The god hurt `victim` at `at`: whoever loves it (and saw, or is family) turns against the god. */
export function godHarmed(w: World, victim: Goblin, at: Vec2): void {
  for (const g of w.s.goblins) {
    if (g.id === victim.id || !loves(g, victim)) continue;
    const saw = !isSleeping(g) && dist(g.pos, at) <= visionRadius(g, w);
    if (!saw && !isKin(g, victim)) continue;
    applyReaction(g, { faith: 4, love: -25, fear: 20 });
    g.godView.angryAtGod = true;
    g.godView.angryUntil = w.s.tick + PW.angerDays * CFG.time.dayTicks;
    addMood(w, g, 'angry_at_god', PW.angerMood, PW.angerDays * CFG.time.dayTicks);
    w.emit({ type: 'emote', goblinId: g.id, emote: g.personality.piety > 0.6 ? 'sweat' : 'anger' });
  }
}

/** Hourly: anger that has run its course fades. */
export function updateAnger(w: World): void {
  if (w.s.tick % CFG.god.hourTicks !== 0) return;
  for (const g of w.s.goblins) if (g.godView.angryAtGod && g.godView.angryUntil <= w.s.tick) calmAnger(w, g);
}
