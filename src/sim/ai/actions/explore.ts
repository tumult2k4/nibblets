import { CFG } from '../../config';
import { q4 } from '../../../shared/math';
import { isWalkable } from '../../grid';
import { moveAlong, planPath } from '../../steering';
import { needUrgency } from '../../goblin/needs';
import { addMood } from '../../goblin/mood';
import { sense } from '../../goblin/memory';
import type { Vec2 } from '../../../shared/types';
import type { Goblin } from '../../state';
import type { UtilityAction } from '../action';

const M = CFG.memory;

/** How familiar a spot is: memories within 8 tiles. */
const familiarity = (g: Goblin, p: Vec2): number => g.memory.reduce((n, m) => n + (Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < 8 ? 1 : 0), 0);

/**
 * Curiosity-driven exploration (§7.8, P2.4): head 12–28 tiles toward the least familiar of six
 * directions, look around on the way (senses every 10 ticks), remember what is found.
 */
export const Explore: UtilityAction = {
  id: 'explore', tags: ['fun'], minStage: 'youngling', interruptible: true,
  isAvailable: (g) => g.needs.energy > 30,
  score: (g) => 0.05 + 0.6 * needUrgency(g.needs.curiosity) * (1 - needUrgency(Math.min(g.needs.hunger, g.needs.thirst))),
  start(g, w) {
    g.activity.progress = g.memory.length;
    const base = w.rng.range(0, Math.PI * 2);
    const cands: { p: Vec2; f: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = base + (i * Math.PI) / 3;
      const r = w.rng.range(M.exploreMin, M.exploreMax);
      const p = { x: q4(g.pos.x + Math.cos(a) * r), y: q4(g.pos.y + Math.sin(a) * r) };
      if (isWalkable(w.s, Math.floor(p.x), Math.floor(p.y))) cands.push({ p, f: familiarity(g, p) });
    }
    cands.sort((a, b) => a.f - b.f);
    for (const c of cands.slice(0, 3))
      if (planPath(w, g, c.p)) {
        g.activity.target = c.p;
        return true;
      }
    return false;
  },
  step(g, w) {
    g.needs.curiosity = Math.min(100, q4(g.needs.curiosity + (CFG.goblin.curiosityWander * M.exploreCuriosityMul) / CFG.tickHz / 6));
    if ((w.s.tick + g.id) % 10 === 0) sense(g, w);
    if (moveAlong(w, g, 0.9) !== 'arrived') return 'running';
    sense(g, w);
    addMood(w, g, 'discovery', 3, 900);
    if (g.memory.length > g.activity.progress) w.emit({ type: 'emote', goblinId: g.id, emote: 'idea' });
    return 'done';
  },
};
