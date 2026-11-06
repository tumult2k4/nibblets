import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Critter } from '../sim/state';
import { CFG } from '../sim/config';
import { flatMat, merge, paint, wobble } from './lowpoly';
import { glowTexture } from './fireView';
import type { Interp } from './interpolation';
import { plantScale } from './props';

interface Rig { root: THREE.Group; body: THREE.Group; parts: THREE.Object3D[]; z: number; ox: number; oy: number; phase: number; jump: number; nextJump: number }

let GEO: Record<string, THREE.BufferGeometry> | null = null;
/** Hopper: a round grey-brown body, long ears, a white tail puff. Chirp: a plump little bird with wings. Fish: a slim dark shape. */
function geos(): Record<string, THREE.BufferGeometry> {
  if (GEO) return GEO;
  const FUR = '#9c8670', EAR = '#c7a58c';
  GEO = {
    hopper: merge([
      paint(wobble(new THREE.IcosahedronGeometry(0.17, 0).scale(0.9, 0.8, 1.2).translate(0, 0.15, 0), 0.02, 3), FUR, 0.06, 2),
      paint(new THREE.IcosahedronGeometry(0.11, 0).translate(0, 0.27, 0.16), FUR, 0.05, 4),
      paint(new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.2, -0.2), '#f3eee4'),
      paint(new THREE.SphereGeometry(0.018, 4, 3).translate(-0.05, 0.3, 0.25), '#2a2420'),
      paint(new THREE.SphereGeometry(0.018, 4, 3).translate(0.05, 0.3, 0.25), '#2a2420'),
    ]),
    ear: paint(new THREE.ConeGeometry(0.035, 0.2, 4).scale(1, 1, 0.5).translate(0, 0.1, 0), EAR, 0.04),
    chirp: merge([
      paint(new THREE.IcosahedronGeometry(0.09, 0).scale(1, 0.95, 1.25), '#d9824a', 0.06, 5),
      paint(new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.07, 0.09), '#5f86b3', 0.04),
      paint(new THREE.ConeGeometry(0.022, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0.065, 0.17), '#f2c14e'),
      paint(new THREE.BoxGeometry(0.07, 0.015, 0.1).translate(0, 0.02, -0.14), '#5f86b3'),
    ]),
    wing: paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, 0.17, 0, 0, 0, 0, -0.06], 3)), '#4f74a0'),
    fish: merge([
      paint(new THREE.OctahedronGeometry(0.16, 0).scale(0.55, 0.45, 1.6), '#2c4a57', 0.05),
      paint(new THREE.ConeGeometry(0.08, 0.12, 3).rotateX(-Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.29), '#223a44'),
    ]),
  };
  return GEO;
}

const wingMat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true, side: THREE.DoubleSide });
let FLY: THREE.SpriteMaterial | null = null;
const flyMat = (): THREE.SpriteMaterial =>
  (FLY ??= new THREE.SpriteMaterial({ map: glowTexture(), color: '#d8ff7a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));

function build(c: Critter): Rig {
  const g = geos(), root = new THREE.Group(), body = new THREE.Group(), parts: THREE.Object3D[] = [];
  root.add(body);
  if (c.kind === 'glimmerfly') {
    const s = new THREE.Sprite(flyMat());
    s.scale.setScalar(0.55);
    body.add(s);
  } else {
    const m = new THREE.Mesh(g[c.kind]!, flatMat);
    m.castShadow = c.kind !== 'fish';
    body.add(m);
    if (c.kind === 'hopper') for (const x of [-0.04, 0.04]) { const e = new THREE.Mesh(g.ear!, flatMat); e.position.set(x, 0.33, 0.13); body.add(e); parts.push(e); }
    if (c.kind === 'chirp') for (const sx of [-1, 1]) { const wg = new THREE.Mesh(g.wing!, wingMat); wg.scale.x = sx; wg.position.set(0.04 * sx, 0.04, 0); body.add(wg); parts.push(wg); }
  }
  root.userData = { kind: 'critter', id: c.id };
  return { root, body, parts, z: c.z, ox: 0, oy: 0, phase: c.id * 1.7, jump: 0, nextJump: 4 + (c.id % 9) };
}

/**
 * Wildlife (§8.4, P7.1): hoppers hop and twitch their ears, chirps flap between perches and sit folded, fish glide
 * under the surface and now and then leap, glimmerflies glow and bob over the marsh at night. Render-only.
 */
export class WildlifeViews {
  readonly group = new THREE.Group();
  private rigs = new Map<number, Rig>();

  constructor(private w: World) {}

  update(interp: Interp, alpha: number, t: number, dt: number): void {
    const seen = new Set<number>();
    const water = CFG.world.waterLevel * CFG.world.heightScale;
    for (const c of this.w.s.wildlife) {
      seen.add(c.id);
      let r = this.rigs.get(c.id);
      if (!r) { r = build(c); this.rigs.set(c.id, r); this.group.add(r.root); }
      const p = interp.get(c.id, alpha);
      if (!p) continue;
      const moving = !!c.goal && c.mode !== 'eat' && c.mode !== 'perch';
      // a chirp sits on the tip of a tree or on top of a bush, not inside the leaves
      const perch = c.kind === 'chirp' && (c.mode === 'perch' || c.mode === 'eat') && c.targetId !== null ? this.w.s.plants.find((x) => x.id === c.targetId) : undefined;
      const k = perch ? plantScale(perch) : 0, a = c.id * 2.4;
      const zT = perch ? (perch.kind === 'tree' ? 2.74 : 0.62) * k : c.z, oT = perch ? (perch.kind === 'tree' ? 0.02 : 0.25) * k : 0;
      const f = Math.min(1, dt * 3);
      r.z += (zT - r.z) * f;
      r.ox += (Math.cos(a) * oT - r.ox) * f;
      r.oy += (Math.sin(a) * oT - r.oy) * f;
      r.phase += dt * (moving ? (c.mode === 'flee' ? 16 : 9) : 2);
      r.root.position.set(p.x + r.ox, p.z + r.z, p.y + r.oy);
      r.root.rotation.y = -p.facing + Math.PI / 2;
      if (c.kind === 'hopper') this.hopper(c, r, moving, t);
      else if (c.kind === 'chirp') this.chirp(c, r, moving, t);
      else if (c.kind === 'fish') this.fish(c, r, water, t, dt);
      else { r.body.position.y = Math.sin(t * 2.3 + c.id) * 0.25; r.body.position.x = Math.sin(t * 1.3 + c.id * 3) * 0.2; (r.body.children[0] as THREE.Sprite).material.opacity = 0.6 + 0.4 * Math.sin(t * 5 + c.id); }
    }
    for (const [id, r] of this.rigs) if (!seen.has(id)) { this.group.remove(r.root); this.rigs.delete(id); }
  }

  private hopper(c: Critter, r: Rig, moving: boolean, t: number): void {
    const hop = moving ? Math.abs(Math.sin(r.phase)) : 0;
    r.body.position.y = hop * (c.mode === 'flee' ? 0.22 : 0.12);
    r.body.rotation.x = c.mode === 'eat' ? 0.35 + Math.sin(t * 9 + c.id) * 0.05 : moving ? -0.25 * Math.cos(r.phase) : 0;
    r.parts.forEach((e, i) => (e.rotation.x = (c.mode === 'flee' ? -0.7 : -0.15) + Math.sin(t * 3 + c.id + i) * 0.08));
  }

  private chirp(c: Critter, r: Rig, moving: boolean, t: number): void {
    const flying = moving && c.z > 0.5;
    r.body.position.y = moving && !flying ? Math.abs(Math.sin(r.phase * 1.5)) * 0.05 : flying ? Math.sin(t * 3 + c.id) * 0.06 : 0;
    r.body.rotation.x = c.mode === 'eat' ? 0.5 : 0;
    r.parts.forEach((wg, i) => (wg.rotation.z = flying ? Math.sin(t * 28 + c.id) * 1.0 * (i ? -1 : 1) : (i ? -1 : 1) * 1.25));
  }

  /** Under the surface, tail wagging; every so often a leap with a splash of light. */
  private fish(c: Critter, r: Rig, water: number, t: number, dt: number): void {
    r.root.position.y = water - 0.07;
    r.nextJump -= dt;
    if (r.nextJump <= 0 && r.jump <= 0) { r.jump = 1; r.nextJump = 9 + ((c.id * 37) % 17); }
    if (r.jump > 0) {
      r.jump = Math.max(0, r.jump - dt * 1.4);
      const k = 1 - r.jump;
      r.body.position.y = Math.sin(k * Math.PI) * 0.55;
      r.body.rotation.x = -Math.cos(k * Math.PI) * 0.9;
    } else {
      r.body.position.y = 0;
      r.body.rotation.x = 0;
      r.body.rotation.y = Math.sin(t * 6 + c.id) * 0.2;
    }
  }
}
