import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Enemy } from '../sim/state';
import { CFG } from '../sim/config';
import { flatMat, merge, paint, wobble } from './lowpoly';
import { itemGeo } from './meshFactory';
import { glowTexture } from './fireView';
import type { Interp } from './interpolation';

const HIDE = '#3d3448', BELLY = '#5b4d63', TOOTH = '#efe6d2', SPINE = '#b4a27e';

interface Rig { root: THREE.Group; body: THREE.Group; head: THREE.Group; jaw: THREE.Mesh; legs: THREE.Mesh[]; mouth: THREE.Group; carried: string; phase: number }

const EYE_MAT = new THREE.MeshBasicMaterial({ color: '#d7ff5a', fog: false });
let GLOW_MAT: THREE.SpriteMaterial | null = null;
/** Two eyes glinting in the dark: the first thing you see of a Gnasher at night. */
const glowMat = (): THREE.SpriteMaterial =>
  (GLOW_MAT ??= new THREE.SpriteMaterial({ map: glowTexture(), color: '#d7ff5a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
let GEO: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; jaw: THREE.BufferGeometry; leg: THREE.BufferGeometry; eye: THREE.BufferGeometry } | null = null;

/** Gnasher (§14.1): a hunched, spiny, dog-sized biter with a huge underbite and glowing eyes. */
function geos(): NonNullable<typeof GEO> {
  if (GEO) return GEO;
  const spines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) spines.push(paint(new THREE.ConeGeometry(0.055, 0.2, 4).rotateX(-0.5).translate(0, 0.35 + (i === 1 || i === 2 ? 0.03 : 0), 0.18 - i * 0.14), SPINE, 0.05));
  GEO = {
    body: merge([
      paint(wobble(new THREE.IcosahedronGeometry(0.3, 0).scale(0.85, 0.75, 1.15).translate(0, 0.22, -0.05), 0.04, 11), HIDE, 0.06, 2),
      paint(new THREE.IcosahedronGeometry(0.2, 0).scale(0.8, 0.6, 1.1).translate(0, 0.14, 0), BELLY, 0.05),
      paint(new THREE.ConeGeometry(0.05, 0.3, 4).rotateX(-2.2).translate(0, 0.22, -0.42), HIDE),
      ...spines,
    ]),
    head: merge([
      paint(wobble(new THREE.BoxGeometry(0.32, 0.2, 0.26).translate(0, 0, 0.1), 0.03, 5), HIDE, 0.06, 3),
      paint(new THREE.ConeGeometry(0.07, 0.22, 4).rotateZ(0.7).translate(-0.19, 0.13, -0.02), HIDE),
      paint(new THREE.ConeGeometry(0.07, 0.22, 4).rotateZ(-0.7).translate(0.19, 0.13, -0.02), HIDE),
    ]),
    jaw: merge([
      paint(new THREE.BoxGeometry(0.34, 0.08, 0.28).translate(0, -0.04, 0.12), BELLY),
      ...[-0.12, -0.04, 0.04, 0.12].map((x) => paint(new THREE.ConeGeometry(0.022, 0.07, 3).translate(x, 0.03, 0.24), TOOTH)),
    ]),
    leg: paint(new THREE.CylinderGeometry(0.035, 0.03, 0.16, 4).translate(0, -0.08, 0), '#2a2433'),
    eye: new THREE.SphereGeometry(0.038, 5, 4),
  };
  return GEO;
}

function build(): Rig {
  const g = geos();
  const root = new THREE.Group();
  const body = new THREE.Group();
  const bm = new THREE.Mesh(g.body, flatMat);
  bm.castShadow = true;
  body.add(bm);
  root.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.3, 0.32);
  head.add(new THREE.Mesh(g.head, flatMat));
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(g.eye, EYE_MAT);
    eye.position.set(x, 0.06, 0.23);
    head.add(eye);
  }
  const glint = new THREE.Sprite(glowMat());
  glint.position.set(0, 0.07, 0.27);
  glint.scale.setScalar(0.42);
  head.add(glint);
  const jaw = new THREE.Mesh(g.jaw, flatMat);
  jaw.position.set(0, -0.08, 0);
  head.add(jaw);
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.06, 0.3);
  head.add(mouth);
  body.add(head);
  const legs = [[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.2], [0.15, -0.2]].map(([x, z]) => {
    const l = new THREE.Mesh(g.leg, flatMat);
    l.position.set(x!, 0.16, z!);
    root.add(l);
    return l;
  });
  return { root, body, head, jaw, legs, mouth, carried: '', phase: 0 };
}

/** Read-only enemy views with a trot, a bite lunge and loot in the mouth. */
export class EnemyViews {
  readonly group = new THREE.Group();
  private rigs = new Map<number, Rig>();

  constructor(private w: World) {}

  update(interp: Interp, alpha: number, t: number, dt: number): void {
    const seen = new Set<number>();
    for (const e of this.w.s.enemies) {
      seen.add(e.id);
      let r = this.rigs.get(e.id);
      if (!r) {
        r = build();
        r.root.userData = { kind: 'enemy', id: e.id };
        this.rigs.set(e.id, r);
        this.group.add(r.root);
      }
      this.animate(e, r, interp, alpha, t, dt);
    }
    for (const [id, r] of this.rigs) if (!seen.has(id)) { this.group.remove(r.root); this.rigs.delete(id); }
  }

  private animate(e: Enemy, r: Rig, interp: Interp, alpha: number, t: number, dt: number): void {
    const p = interp.get(e.id, alpha);
    if (!p) return;
    r.root.position.set(p.x, p.z, p.y);
    r.root.rotation.y = -p.facing + Math.PI / 2;
    const speed = Math.hypot(e.velocity.x, e.velocity.y) * CFG.tickHz;
    const sneaking = e.mode === 'prowl' || e.mode === 'steal';
    r.phase += dt * (4 + speed * 5);
    const ph = r.phase;
    r.body.position.y = speed > 0.1 ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 2 + e.id) * 0.01;
    r.body.rotation.x = sneaking ? 0.18 : e.mode === 'flee' || e.mode === 'leave' ? -0.12 : 0;
    r.body.position.y -= sneaking ? 0.06 : 0;
    r.legs.forEach((l, i) => (l.rotation.x = speed > 0.1 ? Math.sin(ph + (i % 3 === 0 ? 0 : Math.PI)) * 0.7 : 0));
    // bite: lunge and snap while the windup/cooldown timer runs
    const biting = e.mode === 'attack' && e.timer > CFG.enemies.biteCooldown;
    r.head.position.z = 0.32 + (biting ? 0.12 : 0);
    r.jaw.rotation.x = biting ? 0.6 : e.mode === 'attack' ? 0.25 + Math.sin(t * 9) * 0.15 : 0.08;
    const loot = e.carrying?.type ?? '';
    if (loot !== r.carried) {
      r.mouth.clear();
      if (loot) r.mouth.add(new THREE.Mesh(itemGeo(e.carrying!.type), flatMat));
      r.carried = loot;
    }
  }
}
