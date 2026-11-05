/**
 * Wildfire (P6.2): every burning tile gets a few flames (instanced: three nested additive cone layers) sized by its
 * intensity, a column of grey smoke puffs, and the two fires nearest the camera cast a flickering light.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';

const HS = CFG.world.heightScale;
const MAX = CFG.disasters.fire.maxFires * 2;
const LAYERS = [
  { geo: new THREE.ConeGeometry(0.3, 0.9, 6).translate(0, 0.45, 0), color: '#ff6a14', s: 1 },
  { geo: new THREE.ConeGeometry(0.2, 0.65, 6).translate(0, 0.33, 0), color: '#ffa62b', s: 1 },
  { geo: new THREE.ConeGeometry(0.1, 0.38, 5).translate(0, 0.19, 0), color: '#fff1a8', s: 1 },
];
const SMOKE_GEO = new THREE.IcosahedronGeometry(0.35, 0);
const hash = (x: number, y: number, k: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

export class WildfireFx {
  readonly group = new THREE.Group();
  private flames: THREE.InstancedMesh[];
  private smoke: THREE.InstancedMesh;
  private lights: THREE.PointLight[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor(private w: World) {
    this.flames = LAYERS.map((l) => {
      const mat = new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const im = new THREE.InstancedMesh(l.geo, mat, MAX);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 3;
      this.group.add(im);
      return im;
    });
    this.smoke = new THREE.InstancedMesh(SMOKE_GEO, new THREE.MeshLambertMaterial({ color: '#6d6a66', transparent: true, opacity: 0.45, depthWrite: false, flatShading: true }), MAX);
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;
    this.group.add(this.smoke);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight('#ff8a3a', 0, 12, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
  }

  update(t: number, night: number, target: THREE.Vector3): void {
    const s = this.w.s, fires = s.fires;
    let n = 0, k = 0;
    for (const f of fires) {
      const base = heightAt(s, { x: f.x + 0.5, y: f.y + 0.5 }) * HS;
      for (let j = 0; j < 2 && n < MAX; j++, n++) {
        const px = f.x + 0.25 + hash(f.x, f.y, j) * 0.5, pz = f.y + 0.25 + hash(f.y, f.x, j + 3) * 0.5;
        const fl = 1 + Math.sin(t * 12 + f.x * 3 + j * 5) * 0.12 + Math.sin(t * 7.1 + f.y) * 0.08;
        const size = (0.4 + 0.9 * f.intensity) * (j ? 0.75 : 1);
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), t * 0.7 + j);
        this.m.compose(this.v.set(px, base, pz), this.q, this.sc.set(size * (2 - fl), size * fl, size * (2 - fl)));
        for (const im of this.flames) im.setMatrixAt(n, this.m);
      }
      // smoke: a puff rising and swelling, one per tile, its phase from the tile
      if (k < MAX) {
        const ph = (t * 0.35 + hash(f.x, f.y, 9)) % 1;
        const r = (0.5 + ph * 1.4) * (0.5 + 0.5 * f.intensity);
        this.m.compose(this.v.set(f.x + 0.5 + Math.sin(ph * 6 + f.x) * 0.2, base + 1 + ph * 3.2, f.y + 0.5), this.q.identity(), this.sc.set(r, r, r));
        this.smoke.setMatrixAt(k++, this.m);
      }
    }
    for (const im of this.flames) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    this.smoke.count = k;
    this.smoke.instanceMatrix.needsUpdate = true;
    const near = [...fires].sort((a, b) => Math.hypot(a.x - target.x, a.y - target.z) - Math.hypot(b.x - target.x, b.y - target.z));
    this.lights.forEach((l, i) => {
      const f = near[i];
      l.intensity = f ? (0.8 + 3 * night) * f.intensity * (1 + Math.sin(t * 13 + i) * 0.15) : 0;
      if (f) l.position.set(f.x + 0.5, heightAt(s, { x: f.x + 0.5, y: f.y + 0.5 }) * HS + 1.2, f.y + 0.5);
    });
  }
}
