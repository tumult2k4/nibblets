import type { ID, Vec2 } from '../../shared/types';
import { CFG } from '../config';
import { heightAt } from '../grid';
import type { World } from '../world';
import { stepGoblinFlight } from './hand';
import { addMood } from '../goblin/mood';
import { q4 } from '../../shared/math';
import { updateZones } from './zones';
import { updateAnger } from './anger';
import { resolvePending } from './powers/wrath';
import type { FaithState } from './faithState';

export type GameMode = 'sandbox' | 'divine' | 'observer';

export interface HeldState {
  kind: 'goblin' | 'item' | 'egg' | 'plant';
  id: ID;
  pos: Vec2;
  height: number;
  sinceTick: number;
  fearApplied: boolean;
}

/** A patch the god made unbearable for a while (P4.8): `swarm` (biting bugs) or `dread` (after lightning or a meteor). */
/** P8.9 `shun`: a place the god asked these goblins (`ids`) to avoid. */
export interface AvoidZone { kind: 'swarm' | 'dread' | 'shun'; pos: Vec2; r: number; until: number; ids?: ID[] }
/** A wrath strike still on its way down (the meteor's fall, P4.8). */
export interface PendingStrike { power: string; pos: Vec2; r: number; at: number }

export interface GodState {
  mode: GameMode;
  gentle: boolean;
  favor: number;
  alignment: number;
  tier: number;
  /** P8.9: since when the village's faith has earned less than `tier` (it locks again after CFG.divine.relockHours) */
  tierLowSince?: number;
  cooldowns: Record<string, number>;
  godName: string | null;
  held: HeldState | null;
  /** Fast-Forward Day / Hasten Season: the game loop runs at full tilt until this tick (§17.5.2) */
  skipTo?: number;
  zones: AvoidZone[];
  pending: PendingStrike[];
  /** P6.6 Sanctuary domes: enemies are kept out until `until` */
  sanctuaries: { pos: Vec2; r: number; until: number }[];
  /** P8.8: prayers, news, offerings, the shaman's gathering (see faithState.ts) */
  faith?: FaithState;
  /** counters used by divine deeds & stats */
  counts: { grabs: number; gentleSetDowns: number; drops: number; gifts: number; pets: number };
}

export function newGodState(mode: GameMode, gentle = false): GodState {
  return {
    mode, gentle, favor: CFG.god.startFavor, alignment: 0, tier: 0, cooldowns: {}, godName: null, held: null, zones: [], pending: [], sanctuaries: [],
    counts: { grabs: 0, gentleSetDowns: 0, drops: 0, gifts: 0, pets: 0 },
  };
}

export const groundZ = (w: World, p: Vec2): number =>
  Math.max(heightAt(w.s, p), CFG.world.waterLevel) * CFG.world.heightScale;

/** §6 step 8b: held entities follow the hand; airborne goblins/eggs fly. */
export function updateGod(w: World): void {
  const s = w.s;
  const h = s.god.held;
  if (h) {
    const z = q4(groundZ(w, h.pos) + h.height);
    if (h.kind === 'goblin') {
      const g = w.goblin(h.id);
      if (!g) s.god.held = null;
      else {
        g.pos = { x: h.pos.x, y: h.pos.y };
        if (g.airborne) g.airborne.z = z;
        if (!h.fearApplied && s.tick - h.sinceTick > CFG.god.holdFearTicks) {
          h.fearApplied = true;
          g.godView.fear = Math.min(100, g.godView.fear + CFG.god.holdFearGain);
          addMood(w, g, 'held_too_long', CFG.god.holdMoodPenalty, CFG.time.dayTicks / 2);
        }
      }
    } else if (h.kind === 'item') {
      const it = s.groundItems.find((x) => x.id === h.id);
      if (!it) s.god.held = null;
      else {
        it.pos = { x: h.pos.x, y: h.pos.y };
        if (it.airborne) it.airborne.z = z;
      }
    }
  }
  for (const g of s.goblins) if (g.airborne && !g.airborne.held) stepGoblinFlight(w, g);
  if (s.god.skipTo !== undefined && s.tick >= s.god.skipTo) delete s.god.skipTo;
  resolvePending(w);
  updateZones(w);
  updateAnger(w);
}
