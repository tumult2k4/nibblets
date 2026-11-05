import type { ID, Vec2 } from '../../shared/types';
import { CFG } from '../config';
import { heightAt } from '../grid';
import type { World } from '../world';
import { stepGoblinFlight } from './hand';
import { addMood } from '../goblin/mood';
import { q4 } from '../../shared/math';

export type GameMode = 'sandbox' | 'divine' | 'observer';

export interface HeldState {
  kind: 'goblin' | 'item' | 'egg' | 'plant';
  id: ID;
  pos: Vec2;
  height: number;
  sinceTick: number;
  fearApplied: boolean;
}

export interface GodState {
  mode: GameMode;
  gentle: boolean;
  favor: number;
  alignment: number;
  tier: number;
  cooldowns: Record<string, number>;
  godName: string | null;
  held: HeldState | null;
  /** counters used by divine deeds & stats */
  counts: { grabs: number; gentleSetDowns: number; drops: number; gifts: number; pets: number };
}

export function newGodState(mode: GameMode, gentle = false): GodState {
  return {
    mode, gentle, favor: CFG.god.startFavor, alignment: 0, tier: 0, cooldowns: {}, godName: null, held: null,
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
}
