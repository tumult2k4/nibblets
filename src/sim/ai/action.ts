import type { LifeStage } from '../../shared/types';
import type { ActionId, Goblin } from '../state';
import type { World } from '../world';

export type ActionTag = 'work' | 'food' | 'social' | 'danger' | 'fun' | 'rest' | 'divine';
export type StepResult = 'running' | 'done' | 'failed';

export interface UtilityAction {
  id: ActionId;
  tags: ActionTag[];
  minStage: LifeStage;
  /** may a re-decision cut this action short? A function decides per goblin (e.g. only while walking) */
  interruptible: boolean | ((g: Goblin) => boolean);
  /** forced actions (look_up, struggle) are never chosen by scoring */
  forced?: boolean;
  isAvailable(g: Goblin, w: World): boolean;
  /** 0..1 base score (before personality, noise and hysteresis) */
  score(g: Goblin, w: World): number;
  /**
   * P11.3: a cheap upper bound of `score` whenever the action is available, so a decision can skip the costly target
   * search of an action that could not win anyway. Must never be below `score`; left out, the action is always scored.
   */
  cap?(g: Goblin, w: World): number;
  /** set up targets/path; return false if the action cannot start */
  start(g: Goblin, w: World): boolean;
  step(g: Goblin, w: World): StepResult;
}

const ORDER: LifeStage[] = ['egg', 'hatchling', 'youngling', 'adult', 'elder'];
export const stageAtLeast = (s: LifeStage, min: LifeStage): boolean => ORDER.indexOf(s) >= ORDER.indexOf(min);
