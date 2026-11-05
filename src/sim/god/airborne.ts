import { clamp, q4 } from '../../shared/math';
import type { Vec2 } from '../../shared/types';
import { CFG } from '../config';
import { heightAt, isWaterAt } from '../grid';
import type { Airborne } from '../state';
import type { World } from '../world';

export interface FlightResult { landed: boolean; water: boolean; impactSpeed: number }

/**
 * Deterministic ballistic integration (gravity 20 u/s², dt = 1 tick). Mutates `pos` and `air`.
 * Quantized to 4 decimals so saves resume bit-identically.
 */
export function stepAirborne(w: World, pos: Vec2, air: Airborne, bounce: number): FlightResult {
  const dt = 1 / CFG.tickHz;
  air.vel.z = q4(air.vel.z - CFG.god.gravity * dt);
  const nx = clamp(pos.x + air.vel.x * dt, 0.5, w.s.size.w - 0.5);
  const ny = clamp(pos.y + air.vel.y * dt, 0.5, w.s.size.h - 0.5);
  pos.x = q4(nx);
  pos.y = q4(ny);
  air.z = q4(air.z + air.vel.z * dt);
  const water = isWaterAt(w.s, pos);
  const ground = (water ? CFG.world.waterLevel : heightAt(w.s, pos)) * CFG.world.heightScale;
  air.dropHeight = q4(Math.max(air.dropHeight, air.z - ground));
  if (air.z > ground) return { landed: false, water, impactSpeed: 0 };
  const impactSpeed = Math.hypot(air.vel.x, air.vel.y, air.vel.z);
  if (!water && bounce > 0 && Math.abs(air.vel.z) > 2) {
    air.z = q4(ground);
    air.vel = { x: q4(air.vel.x * 0.5), y: q4(air.vel.y * 0.5), z: q4(-air.vel.z * bounce) };
    return { landed: false, water, impactSpeed };
  }
  air.z = q4(ground);
  return { landed: true, water, impactSpeed };
}

/** Fall + throw damage (§17.3): max(0,(h−1.5)×12) + max(0, speed−6)×4; 0 in water. */
export function landingDamage(air: Airborne, water: boolean): number {
  if (water) return 0;
  const G = CFG.god;
  return q4(Math.max(0, (air.dropHeight - G.freeFallHeight) * G.fallDmgPerUnit) +
    Math.max(0, air.throwSpeed - G.impactDmgFreeSpeed) * G.impactDmgPerSpeed);
}
