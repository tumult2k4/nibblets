import * as THREE from 'three';
import type { World } from '../sim/world';
import type { SimEvent } from '../shared/types';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';

const HS = CFG.world.heightScale, HOUR = CFG.god.hourTicks;
const QUAKE_S = 10;

interface Flash { m: THREE.Mesh; t: number; life: number; grow: number; opacity: number }

const glow = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});

/**
 * Miracle FX (P6.6, §17.5): a softly glowing dome over each Sanctuary while it stands (fading in its last hour), the
 * god's floodwater as a raised sheet of water over its area (the higher ground pokes through it), a beam of light for
 * Bring Forth and Resurrect, and the Earthquake's ten seconds of shaking camera with a ring of dust. Render-only.
 */
export class MiracleFx {
  readonly group = new THREE.Group();
  reduced = false;
  private domes = new Map<string, THREE.Group>();
  private floods = new Map<string, THREE.Mesh>();
  private flashes: Flash[] = [];
  private quake = 0;

  constructor(private w: World, private camera: { shake: number }, private waterMat: THREE.Material) {}

  private ground(x: number, y: number): number {
    return Math.max(heightAt(this.w.s, { x, y }), CFG.world.waterLevel) * HS;
  }

  private flash(m: THREE.Mesh, life: number, grow: number): void {
    this.flashes.push({ m, t: 0, life, grow, opacity: (m.material as THREE.MeshBasicMaterial).opacity });
    this.group.add(m);
  }

  /** A column of light where a goblin comes down or rises from its grave. */
  private beam(x: number, y: number, color: string): void {
    const gy = this.ground(x, y);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 14, 12, 1, true).translate(0, 7, 0), glow(color, 0.55));
    col.position.set(x, gy, y);
    this.flash(col, 2.6, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.75, 24).rotateX(-Math.PI / 2), glow(color, 0.8));
    ring.position.set(x, gy + 0.05, y);
    this.flash(ring, 1.6, 3);
  }

  onEvents(evs: SimEvent[]): void {
    for (const e of evs) {
      if (!e.at) continue;
      if (e.type === 'brought_forth') this.beam(e.at.x, e.at.y, '#e6f4ff');
      else if (e.type === 'resurrected') this.beam(e.at.x, e.at.y, '#fff0b8');
      else if (e.type === 'earthquake') {
        this.quake = QUAKE_S;
        const dust = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b39a78', transparent: true, opacity: 0.55, depthWrite: false }));
        dust.position.set(e.at.x, this.ground(e.at.x, e.at.y) + 0.1, e.at.y);
        this.flash(dust, 3, e.r * 0.9);
      }
    }
  }

  update(dt: number, time: number): void {
    const s = this.w.s;
    // Sanctuary domes
    const live = new Set<string>();
    for (const z of s.god.sanctuaries) {
      const key = `${z.pos.x},${z.pos.y},${z.until}`;
      live.add(key);
      let d = this.domes.get(key);
      if (!d) {
        d = new THREE.Group();
        d.add(new THREE.Mesh(new THREE.SphereGeometry(z.r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), glow('#fff4d0', 0.12)));
        d.add(new THREE.Mesh(new THREE.RingGeometry(z.r - 0.15, z.r + 0.1, 64).rotateX(-Math.PI / 2), glow('#ffe7a0', 0.5)));
        d.position.set(z.pos.x, this.ground(z.pos.x, z.pos.y) - 0.2, z.pos.y);
        this.domes.set(key, d);
        this.group.add(d);
      }
      const fade = Math.min(1, (z.until - s.tick) / HOUR);
      const pulse = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(time * 1.6);
      ((d.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.12 * pulse * fade;
      ((d.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.5 * pulse * fade;
    }
    for (const [k, d] of this.domes) if (!live.has(k)) { this.group.remove(d); this.domes.delete(k); dispose(d); }
    // the god's floods: a sheet of water at the raised level
    const wet = new Set<string>();
    for (const f of s.climate.godFloods) {
      const key = `${f.pos.x},${f.pos.y},${f.until}`;
      wet.add(key);
      if (this.floods.has(key) || !f.tiles.length) continue;
      const m = new THREE.Mesh(new THREE.CircleGeometry(f.r, 48).rotateX(-Math.PI / 2), this.waterMat);
      m.position.set(f.pos.x, (CFG.world.waterLevel + CFG.miracles.floodRise) * HS - 0.03, f.pos.y);
      this.floods.set(key, m);
      this.group.add(m);
    }
    for (const [k, m] of this.floods) if (!wet.has(k)) { this.group.remove(m); this.floods.delete(k); m.geometry.dispose(); }
    // beams, rings and dust
    for (const f of [...this.flashes]) {
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      (f.m.material as THREE.MeshBasicMaterial).opacity = f.opacity * (1 - k);
      if (f.grow) f.m.scale.setScalar(1 + f.grow * k);
      if (k >= 1) { this.group.remove(f.m); this.flashes.splice(this.flashes.indexOf(f), 1); f.m.geometry.dispose(); (f.m.material as THREE.Material).dispose(); }
    }
    // the ground shakes for ten seconds, hardest at first
    if (this.quake > 0) {
      this.quake = Math.max(0, this.quake - dt);
      // P11.4: reduced motion means no camera shake at all (the rubble and dust still say it)
      if (!this.reduced) this.camera.shake = Math.max(this.camera.shake, 0.4 * (this.quake / QUAKE_S) + 0.03);
    }
  }
}

function dispose(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
  });
}
