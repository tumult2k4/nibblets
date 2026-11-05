import * as THREE from 'three';
import type { World } from '../sim/world';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat, merge, paint, wobble } from './lowpoly';

/**
 * Grave markers (P4.5 stub; burial, cemetery and the grave inspector come in P6.4): a low earth mound with a
 * rough standing stone and a stuck-in stick where a goblin fell.
 */
let GEO: THREE.BufferGeometry | null = null;
function graveGeo(): THREE.BufferGeometry {
  return (GEO ??= merge([
    paint(wobble(new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.28, 1.5), 0.03, 7), '#6d5236', 0.08, 1),
    paint(wobble(new THREE.BoxGeometry(0.24, 0.32, 0.07).rotateX(-0.12).translate(0, 0.17, -0.36), 0.02, 3), '#8f8b80', 0.08, 2),
    paint(new THREE.ConeGeometry(0.025, 0.3, 4).rotateZ(0.25).translate(0.16, 0.14, -0.3), '#8a6a44', 0.05),
    paint(new THREE.DodecahedronGeometry(0.06, 0).translate(0.12, 0.06, 0.2), '#9a968c', 0.08),
  ]));
}

export class GraveViews {
  readonly group = new THREE.Group();
  private sig = '';

  constructor(private w: World) {}

  update(): void {
    const s = this.w.s;
    const sig = `${s.graves.length}:${s.terrainVersion}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.group.clear();
    for (const gr of s.graves) {
      const m = new THREE.Mesh(graveGeo(), flatMat);
      m.position.set(gr.pos.x, heightAt(s, gr.pos) * CFG.world.heightScale, gr.pos.y);
      m.rotation.y = (gr.id * 2.39996) % (Math.PI * 2);
      m.castShadow = true;
      m.userData = { kind: 'grave', id: gr.id };
      this.group.add(m);
    }
  }
}
