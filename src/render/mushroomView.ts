import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Mushroom } from '../sim/state';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat, merge, paint } from './lowpoly';

const HS = CFG.world.heightScale;
const MAX = 160;
const CAPS: Record<Mushroom['kind'], string> = { brown: '#9a6b3f', glowcap: '#8fe3d4', redcap: '#c63b2b' };

/** A little cluster: one big cap and a smaller one beside it (dots on redcaps). */
function geo(kind: Mushroom['kind']): THREE.BufferGeometry {
  const stem = '#efe6d2';
  const parts = [
    paint(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 5).translate(0, 0.06, 0), stem),
    paint(new THREE.ConeGeometry(0.11, 0.08, 7).translate(0, 0.15, 0), CAPS[kind], 0.05, 3),
    paint(new THREE.CylinderGeometry(0.025, 0.03, 0.07, 4).translate(0.11, 0.035, 0.05), stem),
    paint(new THREE.ConeGeometry(0.07, 0.05, 6).translate(0.11, 0.09, 0.05), CAPS[kind], 0.05, 4),
  ];
  if (kind === 'redcap') for (let i = 0; i < 3; i++) parts.push(paint(new THREE.SphereGeometry(0.018, 3, 2).translate(Math.cos(i * 2.1) * 0.05, 0.17, Math.sin(i * 2.1) * 0.05), '#f4efe6'));
  return merge(parts);
}

/** Instanced mushrooms by kind; glowcaps glow softly at night (§8.2). */
export class MushroomViews {
  readonly group = new THREE.Group();
  private meshes = new Map<Mushroom['kind'], THREE.InstancedMesh>();
  private glowMat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true, emissive: new THREE.Color('#3fd6c0'), emissiveIntensity: 0 });
  private sig = '';

  constructor(private w: World) {
    for (const k of Object.keys(CAPS) as Mushroom['kind'][]) {
      const m = new THREE.InstancedMesh(geo(k), k === 'glowcap' ? this.glowMat : flatMat, MAX);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.meshes.set(k, m);
      this.group.add(m);
    }
  }

  /** Rebuild instance matrices when the set changes (or after terraform: `force`). */
  update(night: number, force = false): void {
    this.glowMat.emissiveIntensity = 0.1 + 0.55 * night;
    const ms = this.w.s.mushrooms;
    const sig = `${ms.length}:${ms[0]?.id ?? 0}:${ms[ms.length - 1]?.id ?? 0}`;
    if (sig === this.sig && !force) return;
    this.sig = sig;
    const n: Record<string, number> = { brown: 0, glowcap: 0, redcap: 0 };
    const o = new THREE.Object3D();
    for (const m of ms) {
      const mesh = this.meshes.get(m.kind)!;
      const i = n[m.kind]!;
      if (i >= MAX) continue;
      o.position.set(m.pos.x, heightAt(this.w.s, m.pos) * HS, m.pos.y);
      o.rotation.set(0, (m.id * 2.39996) % (Math.PI * 2), 0);
      o.scale.setScalar(1.3 + ((m.id * 7919) % 50) / 100);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      n[m.kind] = i + 1;
    }
    for (const [k, mesh] of this.meshes) {
      mesh.count = n[k]!;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
