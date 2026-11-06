import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Trinket } from '../sim/state';
import { heightAt } from '../sim/grid';
import { CFG } from '../sim/config';
import { flatMat, hsl, merge, paint, wobble } from './lowpoly';

/**
 * Trinkets on show (§12.1, P8.2): a little plank shelf on two posts beside a home's door, with each trinket on it
 * as a tiny shape in its own color (pebble, shell, coin, crystal…); and glints, the sparkle of something a storm
 * washed up on the shore.
 */
const HS = CFG.world.heightScale;

/** One trinket's shape at shelf scale, painted in its hue. */
export function trinketGeo(t: Trinket): THREE.BufferGeometry {
  const c = hsl(t.hue, 0.55, 0.55), pale = hsl(t.hue, 0.35, 0.82);
  switch (t.kind) {
    case 'shiny_pebble': return paint(wobble(new THREE.IcosahedronGeometry(0.045, 0).scale(1.2, 0.7, 1), 0.006, t.id), c, 0.05, t.id);
    case 'snail_shell': return paint(new THREE.ConeGeometry(0.04, 0.07, 6).rotateZ(1.2).translate(0, 0.03, 0), pale, 0.06, t.id);
    case 'feather_bundle': return merge([0, 1, 2].map((k) => paint(new THREE.ConeGeometry(0.012, 0.11, 3).rotateZ((k - 1) * 0.35).translate((k - 1) * 0.015, 0.055, 0), hsl(t.hue + k * 25, 0.5, 0.6))));
    case 'glass_shard': return paint(new THREE.TetrahedronGeometry(0.045).scale(0.6, 1.4, 0.6).translate(0, 0.04, 0), hsl(t.hue, 0.4, 0.75));
    case 'bone_charm': return merge([paint(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 4).rotateZ(Math.PI / 2).translate(0, 0.02, 0), '#e8dcc0'), paint(new THREE.SphereGeometry(0.018, 4, 3).translate(0, 0.045, 0), c)]);
    case 'old_coin': return paint(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 8).rotateX(1.3).translate(0, 0.035, 0), '#d9b24a', 0.05, t.id);
    case 'crystal': return paint(new THREE.OctahedronGeometry(0.04).scale(0.7, 1.6, 0.7).translate(0, 0.06, 0), c, 0.04, t.id);
    case 'carved_figurine': return merge([paint(new THREE.CylinderGeometry(0.02, 0.026, 0.06, 5).translate(0, 0.03, 0), '#9a7247'), paint(new THREE.SphereGeometry(0.022, 5, 4).translate(0, 0.075, 0), c)]);
    case 'ancient_tooth': return paint(new THREE.ConeGeometry(0.02, 0.08, 4).translate(0, 0.04, 0), '#efe6cf', 0.04, t.id);
    case 'star_stone': return merge([paint(new THREE.OctahedronGeometry(0.05).scale(1, 1.3, 1).translate(0, 0.06, 0), '#bfe4ff'), paint(new THREE.TetrahedronGeometry(0.025).translate(0.03, 0.03, 0.02), '#f6e7a4')]);
    default: return paint(new THREE.IcosahedronGeometry(0.04, 0).translate(0, 0.04, 0), c);
  }
}

const SHELF = merge([
  paint(new THREE.BoxGeometry(0.62, 0.035, 0.16).translate(0, 0.34, 0), '#8a6a44', 0.06, 3),
  paint(new THREE.BoxGeometry(0.04, 0.34, 0.04).translate(-0.27, 0.17, 0), '#6f5236', 0.05, 4),
  paint(new THREE.BoxGeometry(0.04, 0.34, 0.04).translate(0.27, 0.17, 0), '#6f5236', 0.05, 5),
]);

/** The shelf with its trinkets in a row (up to six), set beside the door of a home. */
export function shelfGroup(ts: readonly Trinket[], longhouse: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shelf';
  g.add(new THREE.Mesh(SHELF, flatMat));
  ts.slice(0, 6).forEach((t, i) => {
    const m = new THREE.Mesh(trinketGeo(t), flatMat);
    m.position.set(-0.24 + i * 0.096, 0.36, 0);
    m.rotation.y = (t.id * 1.3) % Math.PI;
    g.add(m);
  });
  g.position.set(longhouse ? 1.0 : 0.62, 0, longhouse ? 1.5 : 1.12);
  return g;
}

const SPLOTCH = new THREE.SphereGeometry(0.11, 6, 4);
const PAINT_MAT = new THREE.MeshLambertMaterial({ color: '#8e2a4a', flatShading: true });
const SPOTS = [0.3, 0.9, 2.15, 2.75, 3.9];

/** Berry juice daubed on a hut's walls by a prankster (P8.3): a few flat splotches round the front. */
export function paintGroup(id: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = SPOTS[i]! + ((id * 0.7 + i) % 1) * 0.25, y = 0.25 + ((id + i * 3) % 4) * 0.12; // (the door, at π/2, is left clean)
    const m = new THREE.Mesh(SPLOTCH, PAINT_MAT);
    m.position.set(Math.cos(a) * 1.0, y, Math.sin(a) * 1.0);
    m.scale.set(1.5, 0.9 + (i % 2) * 0.5, 0.12);
    m.lookAt(0, y, 0);
    g.add(m);
  }
  return g;
}

const GLINT_GEO = new THREE.OctahedronGeometry(0.07);
const GLINT_MAT = new THREE.MeshBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

/** Glints on the shore: a twinkling speck where something shiny lies. */
export class GlintViews {
  readonly group = new THREE.Group();
  private views = new Map<number, THREE.Mesh>();
  constructor(private w: World) {}

  update(time: number): void {
    const seen = new Set<number>();
    for (const gl of this.w.s.glints ?? []) {
      seen.add(gl.id);
      let m = this.views.get(gl.id);
      if (!m) {
        m = new THREE.Mesh(GLINT_GEO, GLINT_MAT);
        m.position.set(gl.pos.x, heightAt(this.w.s, gl.pos) * HS + 0.08, gl.pos.y);
        this.views.set(gl.id, m);
        this.group.add(m);
      }
      const k = Math.max(0, Math.sin(time * 3 + gl.id * 1.7)) ** 6;
      m.scale.setScalar(0.4 + k);
      m.rotation.y = time * 2 + gl.id;
    }
    for (const [id, m] of this.views) if (!seen.has(id)) { this.group.remove(m); this.views.delete(id); }
  }
}
