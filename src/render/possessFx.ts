/** Possess (Sandbox, P11.1): a possessed goblin's eyes glow gold, day and night; otherwise they glow at night only. */
import * as THREE from 'three';
import type { GoblinRig } from './goblinMesh';

const GOLD = new THREE.Color('#ffc63a');

export function eyeGlow(r: GoblinRig, possessed: boolean, night: number): void {
  const m = r.eyeMat, base = (m.userData.base ??= m.emissive.clone()) as THREE.Color;
  if (possessed !== !!m.userData.gold) {
    m.userData.gold = possessed;
    m.emissive.copy(possessed ? GOLD : base);
  }
  m.emissiveIntensity = possessed ? 1.5 : 0.15 + night * 0.85;
}
