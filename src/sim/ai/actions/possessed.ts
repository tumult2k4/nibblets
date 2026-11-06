/** Possess (Sandbox, P11.1): a possessed goblin walking where the player clicked. Never chosen by the AI. */
import type { UtilityAction } from '../action';
import { moveAlong } from '../../steering';

export const PossessedWalk: UtilityAction = {
  id: 'possessed_walk', tags: ['rest'], minStage: 'hatchling', interruptible: false, forced: true,
  isAvailable: () => false,
  score: () => 0,
  start: () => false,
  step: (g, w) => (moveAlong(w, g) === 'arrived' ? 'done' : 'running'),
};
