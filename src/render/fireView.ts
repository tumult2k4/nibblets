import * as THREE from 'three';
import type { World } from '../sim/world';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { isLit } from '../sim/fire';
import { merge, paint, wobble } from './lowpoly';

const HS = CFG.world.heightScale;

/** Ring of fieldstones around crossed logs and a bed of ash (P4.3). */
export function campfireGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.36, 0.4, 0.04, 8).translate(0, 0.02, 0), '#4a4440')];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(paint(wobble(new THREE.DodecahedronGeometry(0.11, 0).scale(1.2, 0.8, 1).translate(Math.cos(a) * 0.48, 0.07, Math.sin(a) * 0.48), 0.03, i + 3), '#8d8a84', 0.06, i));
  }
  for (let i = 0; i < 3; i++)
    parts.push(paint(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 5).rotateZ(1.15).rotateY((i * Math.PI * 2) / 3).translate(0, 0.14, 0), '#6b4a2e', 0.05, i + 9));
  return merge(parts);
}

/** Flame: three nested additive cones that flicker; reused for torches at a smaller scale. */
const FLAME_MATS = ['#ff7a1a', '#ffb02e', '#fff1a8'].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
const FLAME_GEOS = [new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.ConeGeometry(0.15, 0.45, 6), new THREE.ConeGeometry(0.08, 0.28, 5)];
export function flame(scale = 1): THREE.Group {
  const g = new THREE.Group();
  FLAME_GEOS.forEach((geo, i) => {
    const m = new THREE.Mesh(geo, FLAME_MATS[i]);
    m.position.y = 0.3 - i * 0.06;
    m.renderOrder = 3;
    g.add(m);
  });
  g.scale.setScalar(scale);
  g.name = 'flame';
  return g;
}
export function flicker(f: THREE.Object3D, t: number, seed: number, base = 1): void {
  const k = 1 + Math.sin(t * 13 + seed) * 0.08 + Math.sin(t * 7.3 + seed * 2) * 0.06;
  f.scale.set(base * (2 - k), base * k, base * (2 - k));
  f.rotation.y = t * 0.8 + seed;
}

let GLOW: THREE.Texture | null = null;
/** Soft radial glow (bright core fading to nothing) so the pool has no hard rim; shared. */
export function glowTexture(): THREE.Texture {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return (GLOW = new THREE.CanvasTexture(c));
}
const POOL_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const POOL_MAT = new THREE.MeshBasicMaterial({ color: '#ff9a3c', map: glowTexture(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
const LIGHTS = 4;

/** Flames, a warm ground glow and a small pool of point lights for the lit campfires nearest the camera. */
export class FireFx {
  readonly group = new THREE.Group();
  private fires = new Map<number, THREE.Group>();
  private lights: THREE.PointLight[] = [];

  constructor(private w: World) {
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight('#ffad5c', 0, 14, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
  }

  update(t: number, night: number, target: THREE.Vector3): void {
    const s = this.w.s;
    const lit = s.buildings.filter(isLit);
    const seen = new Set<number>();
    for (const b of lit) {
      seen.add(b.id);
      let g = this.fires.get(b.id);
      if (!g) {
        g = new THREE.Group();
        g.add(flame());
        const pool = new THREE.Mesh(POOL_GEO, POOL_MAT);
        pool.scale.setScalar(CFG.fire.lightRadius * 0.55);
        pool.position.y = 0.05;
        pool.renderOrder = 1;
        g.add(pool);
        g.position.set(b.pos.x, heightAt(s, b.pos) * HS + 0.05, b.pos.y);
        this.fires.set(b.id, g);
        this.group.add(g);
      }
      // a low fire burns small; the festival's fire is built up, Harvest Night's into a bonfire (P8.5)
      const fest = s.village.culture?.festival, here = fest && fest.venueId === b.id && s.tick < fest.endTick;
      const k = (0.55 + 0.45 * Math.min(1, (b.fuel ?? 0) / CFG.fire.ticksPerWood)) * (here ? (fest.kind === 'harvest_night' ? 2.2 : 1.4) : 1);
      flicker(g.children[0]!, t, b.id, k);
    }
    for (const [id, g] of this.fires) if (!seen.has(id)) { this.group.remove(g); this.fires.delete(id); }
    POOL_MAT.opacity = 0.05 + 0.35 * night;
    lit.sort((a, b) => Math.hypot(a.pos.x - target.x, a.pos.y - target.z) - Math.hypot(b.pos.x - target.x, b.pos.y - target.z));
    this.lights.forEach((l, i) => {
      const b = lit[i];
      l.intensity = b ? (0.6 + 3.4 * night) * (1 + Math.sin(t * 11 + i) * 0.1) : 0;
      if (b) l.position.set(b.pos.x, heightAt(s, b.pos) * HS + 0.9, b.pos.y);
    });
  }
}
