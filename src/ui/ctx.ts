import type { EntityKind } from '../render/picking';
import type { Game } from '../game';
import type { Settings, Store } from './store';
import type { ID, Vec2 } from '../shared/types';
import type { Command } from '../sim/commands';

/** What every UI component can reach. Components read the world and push commands; they never mutate it. */
export interface Ctx {
  game: Game;
  store: Store;
  push(cmd: Command): void;
  select(kind: EntityKind | null, ids: ID[]): void;
  flyTo(p: Vec2): void;
  follow(id: ID | null): void;
  toast(text: string, tier: 'info' | 'notable' | 'critical', at?: Vec2, id?: ID): void;
  openOverlay(o: 'pause' | 'saves' | 'settings' | 'help' | 'wizard' | null): void;
  quickSave(): Promise<void>;
  quickLoad(): Promise<void>;
  readOnly(): boolean;
  /** change and keep the player's settings (P9.2: the place-name toggle) */
  applySettings(s: Settings): void;
}

export interface Component {
  mount(parent: HTMLElement): void;
  /** called ~10 Hz after sim batches, and on store changes */
  update(): void;
  /** called every frame (hand, tooltips, quick ring) */
  frame?(dt: number): void;
  destroy?(): void;
}
