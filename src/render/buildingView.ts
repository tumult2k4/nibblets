import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Building } from '../sim/state';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { flatMat, flatMatDouble, merge, paint, wobble } from './lowpoly';
import { pile } from './props';

const HS = CFG.world.heightScale;
const WOOD = '#9a6b3f', THATCH = '#d4a94e', DARK = '#4a3420';

/** Round wattle hut with a thatched cone roof, door and one window (§10, P3.3). */
function hutGeo(): THREE.BufferGeometry {
  return merge([
    paint(wobble(new THREE.CylinderGeometry(0.92, 1.02, 0.95, 7).translate(0, 0.47, 0), 0.05, 31), WOOD, 0.06, 3),
    paint(wobble(new THREE.ConeGeometry(1.42, 1.15, 7).translate(0, 1.5, 0), 0.08, 37), THATCH, 0.07, 5),
    paint(new THREE.ConeGeometry(0.18, 0.3, 5).translate(0, 2.15, 0), '#8a6a2e'),
    paint(new THREE.BoxGeometry(0.42, 0.62, 0.1).translate(0, 0.31, 0.98), DARK),
    paint(new THREE.BoxGeometry(0.1, 0.24, 0.26).translate(0.97, 0.6, 0), '#3a2a1a'),
  ]);
}

/** Scaffold: corner poles, a ring of wall rising with progress, roof frame near the end. */
function scaffoldGroup(progress: number): THREE.Group {
  const g = new THREE.Group();
  const poles: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    poles.push(paint(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 4).translate(Math.cos(a) * 1.05, 0.85, Math.sin(a) * 1.05), '#7a5636'));
  }
  const wallH = Math.max(0.05, Math.min(1, progress / 0.7)) * 0.95;
  poles.push(paint(new THREE.CylinderGeometry(0.95, 1.02, wallH, 7, 1, true).translate(0, wallH / 2, 0), WOOD, 0.08, 7));
  if (progress > 0.7) {
    const k = (progress - 0.7) / 0.3;
    poles.push(paint(new THREE.ConeGeometry(1.4 * k + 0.3, 1.1 * k + 0.1, 7, 1, true).translate(0, 0.95 + (1.1 * k + 0.1) / 2, 0), THATCH, 0.07, 9));
  }
  const m = new THREE.Mesh(merge(poles), flatMatDouble);
  m.castShadow = true;
  g.add(m);
  return g;
}

const GHOST_MAT = new THREE.MeshLambertMaterial({ color: '#9ec5e8', transparent: true, opacity: 0.32, depthWrite: false, flatShading: true });
let HUT: THREE.BufferGeometry | null = null;

const progressBucket = (b: Building) => (b.buildProgress >= 1 ? 10 : Math.floor(b.buildProgress * 10));
const sigOf = (b: Building) => `${b.type}:${progressBucket(b)}:${b.storage.map((s) => s.qty).join('.')}`;

/** Read-only building views: translucent ghosts for blueprints, scaffolds while building, finished huts. */
export class BuildingViews {
  readonly group = new THREE.Group();
  private views = new Map<number, { obj: THREE.Group; sig: string }>();

  constructor(private w: World) {}

  update(): void {
    const seen = new Set<number>();
    for (const b of this.w.s.buildings) {
      seen.add(b.id);
      const sig = sigOf(b);
      const v = this.views.get(b.id);
      if (v && v.sig === sig) continue;
      if (v) this.group.remove(v.obj);
      const obj = this.build(b);
      this.views.set(b.id, { obj, sig });
      this.group.add(obj);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.group.remove(v.obj); this.views.delete(id); }
  }

  /** Re-seat buildings after terraforming. */
  reseat(): void {
    for (const v of this.views.values()) this.group.remove(v.obj);
    this.views.clear();
    this.update();
  }

  private build(b: Building): THREE.Group {
    const g = new THREE.Group();
    g.position.set(b.pos.x, heightAt(this.w.s, b.pos) * HS, b.pos.y);
    g.rotation.y = (b.rotation * Math.PI) / 2 + ((b.id * 0.37) % 0.6) - 0.3;
    g.userData = { buildingId: b.id };
    HUT ??= hutGeo();
    if (b.buildProgress >= 1) {
      const m = new THREE.Mesh(HUT, flatMat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    } else {
      const ghost = new THREE.Mesh(HUT, GHOST_MAT);
      ghost.renderOrder = 2;
      g.add(ghost);
      if (b.buildProgress > 0) g.add(scaffoldGroup(b.buildProgress));
      // delivered materials wait beside the site
      b.storage.forEach((st, i) => {
        const p = pile(st.type, st.qty, b.id * 7 + i);
        p.position.set(1.5, 0, -0.6 + i * 0.7);
        g.add(p);
      });
    }
    g.traverse((o) => (o.userData = { ...o.userData, buildingId: b.id }));
    return g;
  }
}
