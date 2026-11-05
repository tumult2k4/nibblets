import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Egg } from '../sim/state';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { hslCss } from '../shared/math';
import { express } from '../sim/goblin/genetics/phenotype';
import { flatMat, merge, paint, wobble } from './lowpoly';

/**
 * Eggs (§4.4, P5.3): a speckled egg tinted with the unborn child's skin hue (its genome exists from laying). It
 * shivers when cold, and rocks harder and harder in the last hours before it hatches.
 */
function eggGeo(e: Egg): THREE.BufferGeometry {
  const h = express(e.genome, 'skinHue');
  const shell = hslCss({ h, s: 0.62, l: 0.62 });
  const spot = hslCss({ h: (h + 25) % 360, s: 0.5, l: 0.36 });
  const parts = [paint(wobble(new THREE.SphereGeometry(0.11, 7, 5).scale(1, 1.3, 1), 0.006, e.id), shell, 0.04, e.id)];
  for (let i = 0; i < 6; i++) {
    const a = (e.id * 1.7 + i * 2.1) % (Math.PI * 2), y = ((e.id + i * 37) % 9) / 9 - 0.45;
    const r = 0.11 * Math.sqrt(1 - y * y * 0.8);
    parts.push(paint(new THREE.IcosahedronGeometry(0.018, 0).translate(Math.cos(a) * r, y * 0.13, Math.sin(a) * r), spot, 0.05, i));
  }
  return merge(parts).translate(0, 0.14, 0);
}
/** A little ring of straw the egg sits in. */
let NEST: THREE.BufferGeometry | null = null;
const nestGeo = (): THREE.BufferGeometry =>
  (NEST ??= paint(wobble(new THREE.TorusGeometry(0.14, 0.05, 4, 9).rotateX(Math.PI / 2).translate(0, 0.04, 0), 0.015, 3), '#b8954f', 0.12, 4));

interface EggMesh { mesh: THREE.Mesh; id: number }

export class EggViews {
  readonly group = new THREE.Group();
  private views = new Map<number, EggMesh>();
  private t = 0;

  constructor(private w: World) {}

  update(dt: number, reducedMotion = false): void {
    this.t += dt;
    const s = this.w.s;
    const live = new Set<number>();
    const DAY = CFG.time.dayTicks, F = CFG.family;
    for (const e of s.eggs) {
      live.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        const mesh = new THREE.Mesh(eggGeo(e), flatMat);
        mesh.castShadow = true;
        mesh.add(new THREE.Mesh(nestGeo(), flatMat));
        mesh.userData = { kind: 'egg', id: e.id };
        this.group.add(mesh);
        v = { mesh, id: e.id };
        this.views.set(e.id, v);
      }
      const y = e.airborne ? e.airborne.z : heightAt(s, e.pos) * CFG.world.heightScale;
      v.mesh.position.set(e.pos.x, y, e.pos.y);
      const left = F.incubateDays * DAY - e.incubation; // ticks to hatching
      const rock = reducedMotion ? 0 : left < DAY / 6 ? 0.25 * Math.max(0, Math.sin(this.t * 9 + e.id)) ** 3 : e.warmth < 0.5 ? 0.04 * Math.sin(this.t * 40 + e.id) : 0;
      v.mesh.rotation.set(0, e.id, rock);
    }
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      this.group.remove(v.mesh);
      v.mesh.geometry.dispose();
      this.views.delete(id);
    }
  }
}
