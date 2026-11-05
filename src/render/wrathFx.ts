/**
 * Wrath FX (P4.8, §17.5.4): the god's bolt and its scorch mark, bug swarms over swarm zones, a little rain cloud over
 * cursed goblins, the meteor falling (from `god.pending`) with its flash, shockwave, ring of flames and scorched crater,
 * and a smoky puff where something is summoned. Read-only on the sim; randomness here is cosmetic.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { ID, SimEvent } from '../shared/types';
import { CFG } from '../sim/config';
import { heightAt } from '../sim/grid';
import { isCursed } from '../sim/god/powers/wrath';

const HS = CFG.world.heightScale;
const BUGS_PER_ZONE = 90, MAX_ZONES = 4, CLUMPS = 6;
const METEOR_R = 4;

type BurstKind = 'scorch' | 'puff' | 'shock' | 'flames';
interface Burst { obj: THREE.Object3D; life: number; max: number; kind: BurstKind; size: number }
interface Sky { strike(at: THREE.Vector3): void; flash(k: number): void }

const disc = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const ring = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
const ball = new THREE.IcosahedronGeometry(1, 0);
const flame = new THREE.ConeGeometry(0.22, 0.9, 5).translate(0, 0.45, 0);
const fade = (color: string, opacity: number, additive = false) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, ...(additive ? { blending: THREE.AdditiveBlending } : {}),
});

export class WrathFx {
  readonly group = new THREE.Group();
  reduced = false;
  private bursts: Burst[] = [];
  private bugs: THREE.Points;
  private bugPos = new Float32Array(BUGS_PER_ZONE * MAX_ZONES * 3);
  private seeds = Array.from({ length: BUGS_PER_ZONE }, () => ({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()), s: 0.6 + Math.random() * 1.8, h: Math.random() }));
  private clouds = new Map<ID, THREE.Group>();
  private meteors = new Map<number, THREE.Group>();
  private time = 0;

  constructor(private w: World, private sky: Sky, private goblinPos: (id: ID) => THREE.Vector3 | null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.bugPos, 3));
    this.bugs = new THREE.Points(g, new THREE.PointsMaterial({ color: '#241d17', size: 0.14, sizeAttenuation: true }));
    this.bugs.frustumCulled = false;
    this.group.add(this.bugs);
  }

  private groundAt(x: number, y: number): number {
    return Math.max(heightAt(this.w.s, { x, y }), CFG.world.waterLevel) * HS;
  }

  private burst(kind: BurstKind, obj: THREE.Object3D, life: number, size: number): void {
    this.group.add(obj);
    this.bursts.push({ obj, life, max: life, kind, size });
  }

  private scorch(x: number, y: number, r: number, life: number): void {
    const m = new THREE.Mesh(disc, fade('#2a1d14', 0.55));
    m.position.set(x, this.groundAt(x, y) + 0.06, y);
    m.scale.setScalar(r);
    m.renderOrder = 2;
    this.burst('scorch', m, life, r);
  }

  onEvents(evs: SimEvent[]): void {
    for (const e of evs) {
      if (e.type !== 'divine_act' || !e.at) continue;
      const { x, y } = e.at;
      const gy = this.groundAt(x, y);
      if (e.act === 'lightning') {
        this.sky.strike(new THREE.Vector3(x, gy, y));
        this.scorch(x, y, 1.3, 45);
        const p = new THREE.Mesh(ball, fade('#fff6c8', 0.9, true));
        p.position.set(x, gy + 0.4, y);
        this.burst('puff', p, 0.4, 1.4);
      } else if (e.act === 'meteor') {
        this.sky.flash(1);
        this.scorch(x, y, METEOR_R + 1.2, 90);
        const s = new THREE.Mesh(ring, fade('#ffd7a0', 0.9, true));
        s.position.set(x, gy + 0.3, y);
        this.burst('shock', s, 1.2, METEOR_R * 2.5);
        const fl = new THREE.Group();
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2, rr = METEOR_R + (Math.random() - 0.5) * 0.8;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          const f = new THREE.Group();
          const outer = new THREE.Mesh(flame, fade(i % 3 ? '#e8521c' : '#f07a1e', 0.9));
          const inner = new THREE.Mesh(flame, fade('#ffd25a', 0.95));
          inner.scale.set(0.5, 0.6, 0.5);
          f.add(outer, inner);
          f.position.set(px, this.groundAt(px, py), py);
          f.scale.setScalar(0.6 + Math.random() * 0.5);
          f.userData.base = f.scale.x;
          fl.add(f);
        }
        this.burst('flames', fl, 10, 1);
      } else if (e.act === 'summon_gnashers' || e.act === 'summon_bramblebeast') {
        const p = new THREE.Mesh(ball, fade('#4a2f66', 0.75));
        p.position.set(x, gy + 0.8, y);
        this.burst('puff', p, 1.4, e.act === 'summon_bramblebeast' ? 3.5 : 2.6);
      }
    }
  }

  update(dt: number, alpha: number): void {
    this.time += dt;
    this.updateBursts(dt);
    this.updateSwarms();
    this.updateClouds();
    this.updateMeteors(alpha);
  }

  private updateBursts(dt: number): void {
    for (const b of this.bursts) {
      b.life -= dt;
      const k = Math.max(0, b.life / b.max), u = 1 - k;
      if (b.kind === 'scorch') ((b.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, k * 3);
      else if (b.kind === 'puff' || b.kind === 'shock') {
        b.obj.scale.setScalar(0.3 + u * b.size);
        ((b.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (b.kind === 'shock' ? 0.9 : 0.75) * k;
      } else b.obj.children.forEach((f, i) => {
        const base = (f.userData.base as number) ?? 1;
        const fl = 0.75 + Math.sin(this.time * 13 + i * 1.7) * 0.25;
        f.scale.set(base, base * (this.reduced ? 0.9 : fl) * Math.min(1, k * 2.5), base);
      });
    }
    for (const b of this.bursts.filter((x) => x.life <= 0)) {
      this.group.remove(b.obj);
      b.obj.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
    }
    this.bursts = this.bursts.filter((x) => x.life > 0);
  }

  /** Bugs whirl in a few drifting clumps over each swarm zone. */
  private updateSwarms(): void {
    const zones = this.w.s.god.zones.filter((z) => z.kind === 'swarm').slice(0, MAX_ZONES);
    let n = 0;
    const t = this.time;
    zones.forEach((z, zi) => {
      for (let i = 0; i < BUGS_PER_ZONE; i++) {
        const sd = this.seeds[i]!, c = i % CLUMPS;
        // each clump wanders on its own slow loop inside the zone
        const ca = c * 2.4 + zi + t * (0.25 + c * 0.04), cr = z.r * (0.25 + 0.5 * ((c * 0.37) % 1));
        const cx = z.pos.x + Math.cos(ca) * cr, cy = z.pos.y + Math.sin(ca * 1.3) * cr;
        const a = sd.a + t * sd.s * 3 * (i % 2 ? 1 : -1), rr = 0.25 + sd.r * 0.7;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        this.bugPos[n * 3] = x;
        this.bugPos[n * 3 + 1] = this.groundAt(x, y) + 0.5 + sd.h * 1.2 + Math.sin(t * 9 + i * 2.1) * 0.15;
        this.bugPos[n * 3 + 2] = y;
        n++;
      }
    });
    const geo = this.bugs.geometry;
    geo.setDrawRange(0, n);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.bugs.visible = n > 0;
  }

  /** A small dark cloud drizzling over each cursed goblin. */
  private updateClouds(): void {
    const seen = new Set<ID>();
    for (const g of this.w.s.goblins) {
      if (!isCursed(this.w, g)) continue;
      const p = this.goblinPos(g.id);
      if (!p) continue;
      seen.add(g.id);
      let c = this.clouds.get(g.id);
      if (!c) this.clouds.set(g.id, (c = makeCloud()));
      if (!c.parent) this.group.add(c);
      c.position.set(p.x, p.y + 1.2 + Math.sin(this.time * 2 + g.id) * 0.05, p.z);
      const rain = c.children[3] as THREE.LineSegments;
      rain.position.y = -((this.time * 1.6) % 0.4);
    }
    for (const [id, c] of this.clouds) if (!seen.has(id)) { this.group.remove(c); this.clouds.delete(id); }
  }

  /** A burning stone streaks down toward each pending meteor strike. */
  private updateMeteors(alpha: number): void {
    const s = this.w.s;
    const live = new Set<number>();
    for (const p of s.god.pending) {
      if (p.power !== 'meteor') continue;
      live.add(p.at);
      let m = this.meteors.get(p.at);
      if (!m) {
        m = new THREE.Group();
        const rock = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: '#ffb347' }));
        rock.scale.setScalar(0.8);
        const glow = new THREE.Mesh(ball, fade('#ff7a2a', 0.45, true));
        glow.scale.setScalar(1.8);
        const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.8, 7, 6, 1, true).translate(0, 3.5, 0), fade('#ffcf7a', 0.5, true));
        m.add(rock, glow, trail);
        this.meteors.set(p.at, m);
        this.group.add(m);
      }
      const f = Math.min(1, Math.max(0, 1 - (p.at - s.tick - alpha) / CFG.powers.meteorDelay));
      const gy = this.groundAt(p.pos.x, p.pos.y);
      const from = new THREE.Vector3(p.pos.x - 9, gy + 30, p.pos.y - 6), to = new THREE.Vector3(p.pos.x, gy, p.pos.y);
      m.position.copy(from).lerp(to, f ** 1.4);
      const dir = from.clone().sub(to).normalize();
      m.children[2]!.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
    for (const [at, m] of this.meteors) if (!live.has(at)) { this.group.remove(m); this.meteors.delete(at); }
  }
}

function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#4b4652', flatShading: true });
  for (const [x, y, r] of [[-0.22, 0, 0.26], [0.18, 0.02, 0.24], [0, 0.12, 0.3]] as const) {
    const b = new THREE.Mesh(ball, mat);
    b.position.set(x, y, 0);
    b.scale.set(r, r * 0.75, r);
    g.add(b);
  }
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i / 5 - 0.5) * 0.5, z = (i % 2 ? 0.08 : -0.08);
    for (const y0 of [-0.15, -0.55]) pts.push(x, y0, z, x, y0 - 0.18, z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#8fb3d9', transparent: true, opacity: 0.8 })));
  return g;
}
