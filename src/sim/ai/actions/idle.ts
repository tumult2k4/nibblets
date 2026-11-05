import type { UtilityAction } from '../action';

export const Idle: UtilityAction = {
  id: 'idle', tags: ['rest'], minStage: 'hatchling', interruptible: true,
  isAvailable: () => true,
  score: () => 0.08,
  start(g, w) {
    g.activity.progress = 30 + (g.id * 7 + w.s.tick) % 40;
    return true;
  },
  step(g) {
    g.velocity = { x: 0, y: 0 };
    g.activity.progress -= 1;
    return g.activity.progress <= 0 ? 'done' : 'running';
  },
};
