import type { TrayTab } from '../sim/items';
import type { EntityKind } from '../render/picking';
import type { TerraformPower } from '../sim/god/terraform';
import type { BuildingType, EnemyKind, ID, ItemType, PlantKind, PlantStage } from '../shared/types';
import type { Genome, LocusId } from '../sim/goblin/genetics/genome';
import type { Lang } from './i18n';

export type ToolId = 'hand' | 'gifts' | 'nature' | 'terraform' | 'wrath' | 'miracles';
export type Lens = 'default' | 'needs' | 'faith' | 'mood' | 'genetics' | 'fertility' | 'moisture' | 'paths' | 'temperature' | 'danger';
export const LENSES: Lens[] = ['default', 'needs', 'faith', 'mood', 'genetics', 'fertility', 'moisture', 'paths', 'temperature', 'danger'];
/** Lenses that recolor the terrain instead of ringing goblins. */
export const TERRAIN_LENSES: Lens[] = ['fertility', 'moisture', 'paths', 'temperature', 'danger'];

export type SandboxTab = 'spawn' | 'breed' | 'genome' | 'goblin' | 'world';
/** What the Sandbox drawer's placement tool puts down where you click (§17.5.6). */
export type SpawnSpec =
  | { kind: 'item'; item: ItemType }
  | { kind: 'plant'; plant: PlantKind; stage: PlantStage }
  | { kind: 'building'; building: BuildingType; complete: boolean }
  | { kind: 'enemy'; enemy: EnemyKind }
  | { kind: 'egg' }
  | { kind: 'goblin'; genome: Genome; ageDays: number };

export interface Settings {
  shadows: 'off' | 'low' | 'high'; renderScale: number; outlines: boolean; fog: boolean;
  edgePan: boolean; invertOrbit: boolean; autopauseDeath: boolean; tooltipDelay: number;
  uiScale: number; reducedMotion: boolean; language: Lang;
  /** §18.4 step 4: ask before a cast that would kill a goblin */
  confirmLethal: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  shadows: 'high', renderScale: 1, outlines: true, fog: true, edgePan: false, invertOrbit: false, autopauseDeath: false,
  tooltipDelay: 350, uiScale: 1, reducedMotion: false, language: 'en', confirmLethal: true,
};

export interface UIState {
  screen: 'title' | 'game' | 'replay';
  selection: ID[];
  selectedKind: EntityKind | null;
  hoveredId: ID | null;
  activeTool: ToolId;
  openPanels: { inspector: boolean; feed: boolean; debug: boolean; flyout: boolean; tray: boolean; village: boolean; family?: boolean; sandbox?: boolean };
  /** Sandbox drawer (P5.9): its tab, and what a click on the ground places (null: nothing armed) */
  sandboxTab?: SandboxTab;
  spawn?: SpawnSpec | null;
  /** genetics lens (P5.9): color goblins by this locus (none: by skin hue) */
  geneLocus?: LocusId | null;
  /** the family tree centers on this goblin when opened from its inspector (P5.8) */
  familyFocus?: ID | null;
  overlay: null | 'pause' | 'saves' | 'settings' | 'help' | 'wizard';
  lens: Lens;
  trayTab: TrayTab;
  power: TerraformPower;
  brushRadius: number;
  powerOption: string;
  /** armed god_cast power (§18.4 casting UX) and its radius; `castOption`: the Plague's disease, Bring Forth's stock (P6.6) */
  armed: string | null;
  castOption?: string;
  castRadius: number;
  inspectorTab: 'status' | 'mind' | 'social' | 'body' | 'inventory';
  settings: Settings;
}

type Sub = (s: UIState, prev: UIState) => void;

/** Tiny observable UI store (§18.13). */
export class Store {
  private subs: Sub[] = [];
  constructor(public state: UIState) {}
  set(patch: Partial<UIState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    for (const s of this.subs) s(this.state, prev);
  }
  subscribe(fn: Sub): () => void {
    this.subs.push(fn);
    return () => (this.subs = this.subs.filter((s) => s !== fn));
  }
}

const PREFIX = 'nibblets.ui.';
export function loadPref<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? { ...def, ...(JSON.parse(raw) as T) } : def;
  } catch {
    return def;
  }
}
export function savePref(key: string, v: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: preferences just won't persist */
  }
}

export function initialState(): UIState {
  return {
    screen: 'title', selection: [], selectedKind: null, hoveredId: null, activeTool: 'hand',
    openPanels: { inspector: true, feed: true, debug: false, flyout: false, tray: false, village: false },
    overlay: null, lens: 'default', trayTab: 'food', inspectorTab: 'status', power: 'raise_land', brushRadius: 3, powerOption: 'apple_bush', armed: null, castRadius: 8,
    settings: loadPref('settings', DEFAULT_SETTINGS),
  };
}
