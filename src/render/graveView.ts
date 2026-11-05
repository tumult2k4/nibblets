import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Grave } from '../sim/state';
import type { ID } from '../shared/types';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat, merge, paint, wobble } from './lowpoly';

/**
 * The dead (§13.7, P6.4): a shrouded body where a goblin fell (or on its carrier's shoulders), then a grave in the
 * village graveyard (mound and standing stone), or a bare mound with a stick where nobody came for it.
 */
let GEO: THREE.BufferGeometry | null = null, MOUND: THREE.BufferGeometry | null = null, BODY: THREE.BufferGeometry | null = null;
function graveGeo(): THREE.BufferGeometry {
  return (GEO ??= merge([
    paint(wobble(new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.28, 1.5), 0.03, 7), '#6d5236', 0.08, 1),
    paint(wobble(new THREE.BoxGeometry(0.24, 0.32, 0.07).rotateX(-0.12).translate(0, 0.17, -0.36), 0.02, 3), '#8f8b80', 0.08, 2),
    paint(new THREE.DodecahedronGeometry(0.06, 0).translate(0.12, 0.06, 0.2), '#9a968c', 0.08),
  ]));
}
function moundGeo(): THREE.BufferGeometry {
  return (MOUND ??= merge([
    paint(wobble(new THREE.IcosahedronGeometry(0.3, 0).scale(1, 0.25, 1.4), 0.03, 9), '#6d5236', 0.08, 1),
    paint(new THREE.ConeGeometry(0.025, 0.3, 4).rotateZ(0.25).translate(0.1, 0.14, -0.3), '#8a6a44', 0.05),
  ]));
}
function bodyGeo(): THREE.BufferGeometry {
  return (BODY ??= merge([
    paint(wobble(new THREE.IcosahedronGeometry(0.16, 1).scale(1, 0.55, 2), 0.02, 5), '#d9cfb8', 0.06, 2),
    paint(new THREE.TorusGeometry(0.1, 0.012, 3, 8).scale(1, 0.6, 1).translate(0, 0, -0.12), '#a8894a'),
    paint(new THREE.TorusGeometry(0.1, 0.012, 3, 8).scale(1, 0.6, 1).translate(0, 0, 0.14), '#a8894a'),
  ]));
}

export class GraveViews {
  readonly group = new THREE.Group();
  private sig = '';
  private bodies = new Map<ID, THREE.Mesh>();

  constructor(private w: World, private goblinPos: (id: ID) => THREE.Vector3 | null = () => null) {}

  private ground(p: { x: number; y: number }): number {
    return heightAt(this.w.s, p) * CFG.world.heightScale;
  }

  private mesh(gr: Grave, geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geo, flatMat);
    m.position.set(gr.pos.x, this.ground(gr.pos), gr.pos.y);
    m.rotation.y = gr.state === 'buried' ? 0 : (gr.id * 2.39996) % (Math.PI * 2); // rows face the same way
    m.castShadow = true;
    m.userData = { kind: 'grave', id: gr.id };
    return m;
  }

  update(): void {
    const s = this.w.s;
    const laid = s.graves.filter((g) => g.state === 'buried' || g.state === 'mound');
    const sig = `${laid.length}:${s.terrainVersion}`;
    if (sig !== this.sig) {
      this.sig = sig;
      for (const c of [...this.group.children]) if (c.userData.laid) this.group.remove(c);
      for (const gr of laid) {
        const m = this.mesh(gr, gr.state === 'buried' ? graveGeo() : moundGeo());
        m.userData.laid = true;
        this.group.add(m);
      }
    }
    // bodies: lying where they fell, or on a carrier's shoulders
    const open = new Set<ID>();
    for (const gr of s.graves) {
      if (gr.state !== 'lying' && gr.state !== 'carried') continue;
      open.add(gr.id);
      let m = this.bodies.get(gr.id);
      if (!m) { m = this.mesh(gr, bodyGeo()); this.bodies.set(gr.id, m); this.group.add(m); }
      const carrier = gr.state === 'carried' && gr.carrierId !== null ? this.goblinPos(gr.carrierId) : null;
      if (carrier) { m.position.set(carrier.x, carrier.y + 0.5, carrier.z); m.rotation.set(0, (gr.id * 2.39996) % Math.PI, 0); }
      else { m.position.set(gr.pos.x, this.ground(gr.pos) + 0.07, gr.pos.y); m.rotation.set(0, (gr.id * 2.39996) % (Math.PI * 2), 0); }
    }
    for (const [id, m] of this.bodies) if (!open.has(id)) { this.group.remove(m); this.bodies.delete(id); }
  }
}
