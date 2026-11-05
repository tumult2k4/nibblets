import type { LifeStage } from '../../shared/types';
import type { ActionId, Goblin } from '../state';
import type { World } from '../world';

export type ActionTag = 'work' | 'food' | 'social' | 'danger' | 'fun' | 'rest' | 'divine';
export type StepResult = 'running' | 'done' | 'failed';

export interface UtilityAction {
  id: ActionId;
  tags: ActionTag[];
  minStage: LifeStage;
  interruptible: boolean;
  /** forced actions (look_up, struggle) are never chosen by scoring */
  forced?: boolean;
  isAvailable(g: Goblin, w: World): boolean;
  /** 0..1 base score (before personality, noise and hysteresis) */
  score(g: Goblin, w: World): number;
  /** set up targets/path; return false if the action cannot start */
  start(g: Goblin, w: World): boolean;
  step(g: Goblin, w: World): StepResult;
}

const ORDER: LifeStage[] = ['egg', 'hatchling', 'youngling', 'adult', 'elder'];
export const stageAtLeast = (s: LifeStage, min: LifeStage): boolean => ORDER.indexOf(s) >= ORDER.indexOf(min);
