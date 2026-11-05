import * as THREE from 'three';
import type { Enemy } from '../sim/state';
import { CFG } from '../sim/config';
import { flatMat, merge, paint, wobble } from './lowpoly';
import { glowTexture } from './fireView';

/** A rig for one enemy kind: its scene root and a per-frame pose (EnemyViews sets position and heading). */
export interface KindRig { root: THREE.Group; animate(e: Enemy, t: number, dt: number): void }

const VINE = '#46552c', BARK = '#5b432c', THORN = '#dccca2', MOSS = '#7f9d40', DARK = '#2d3320';
const B = CFG.enemies.bramblebeast;

let BEAST: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; leg: THREE.BufferGeometry; eye: THREE.BufferGeometry } | null = null;
const EMBER = new THREE.MeshBasicMaterial({ color: '#ffb347', fog: false });

/** Bramblebeast (§14.1): a hulking bear of knotted vines and bark, bristling with thorns, mossy hump, ember eyes. */
function beastGeos(): NonNullable<typeof BEAST> {
  if (BEAST) return BEAST;
  const thorns: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, z = 0.55 - (i / 13) * 1.1, r = 0.42 + 0.06 * Math.sin(i * 1.7);
    const c = new THREE.ConeGeometry(0.045, 0.24, 4).translate(0, 0.12, 0);
    c.rotateZ(Math.cos(a) * 1.2).rotateX(-0.4);
    thorns.push(paint(c.translate(Math.sin(a) * r * 0.9, 0.62 + Math.abs(Math.cos(a)) * r * 0.55, z), THORN, 0.05, i));
  }
  const vines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++)
    vines.push(paint(new THREE.TorusGeometry(0.46, 0.05, 4, 9, Math.PI * 1.3).rotateY(Math.PI / 2).rotateX(i * 0.3).translate(0, 0.58, 0.42 - i * 0.22), i % 2 ? BARK : DARK, 0.05, i + 3));
  BEAST = {
    body: merge([
      paint(wobble(new THREE.IcosahedronGeometry(0.55, 1).scale(0.95, 0.8, 1.35).translate(0, 0.62, -0.02), 0.07, 17), VINE, 0.08, 4),
      paint(wobble(new THREE.IcosahedronGeometry(0.34, 0).scale(1.1, 0.55, 1.2).translate(0, 1.0, -0.12), 0.05, 8), MOSS, 0.1, 6),
      ...vines, ...thorns,
    ]),
    head: merge([
      paint(wobble(new THREE.IcosahedronGeometry(0.27, 0).scale(1, 0.85, 1.1), 0.04, 9), BARK, 0.07, 2),
      paint(new THREE.BoxGeometry(0.26, 0.14, 0.2).translate(0, -0.08, 0.2), DARK, 0.05),
      paint(new THREE.ConeGeometry(0.05, 0.2, 4).rotateZ(0.9).translate(-0.2, 0.18, -0.05), THORN),
      paint(new THREE.ConeGeometry(0.05, 0.2, 4).rotateZ(-0.9).translate(0.2, 0.18, -0.05), THORN),
    ]),
    leg: merge([
      paint(new THREE.CylinderGeometry(0.12, 0.1, 0.5, 5).translate(0, -0.25, 0), BARK, 0.06),
      paint(new THREE.ConeGeometry(0.03, 0.12, 3).rotateX(1.4).translate(0, -0.48, 0.1), THORN),
    ]),
    eye: new THREE.SphereGeometry(0.045, 5, 4),
  };
  return BEAST;
}

export function buildBramble(): KindRig {
  const g = beastGeos();
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  const bm = new THREE.Mesh(g.body, flatMat);
  bm.castShadow = true;
  body.add(bm);
  head.position.set(0, 0.6, 0.72);
  head.add(new THREE.Mesh(g.head, flatMat));
  for (const x of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(g.eye, EMBER);
    eye.position.set(x, 0.04, 0.24);
    head.add(eye);
  }
  body.add(head);
  root.add(body);
  const legs = [[-0.32, 0.4], [0.32, 0.4], [-0.32, -0.42], [0.32, -0.42]].map(([x, z]) => {
    const l = new THREE.Mesh(g.leg, flatMat);
    l.castShadow = true;
    l.position.set(x!, 0.5, z!);
    root.add(l);
    return l;
  });
  let phase = 0, hp = Infinity, hurt = 0;
  return {
    root,
    animate(e, t, dt) {
      const speed = Math.hypot(e.velocity.x, e.velocity.y) * CFG.tickHz;
      phase += dt * (1.5 + speed * 3);
      // a heavy, rolling lumber
      body.rotation.z = Math.sin(phase) * 0.06;
      body.position.y = speed > 0.1 ? Math.abs(Math.sin(phase)) * 0.06 : Math.sin(t * 1.3 + e.id) * 0.015;
      legs.forEach((l, i) => (l.rotation.x = speed > 0.1 ? Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 : 0));
      // smash: rear up as the timer runs down, slam on the blow
      const smash = e.mode === 'smash' ? 1 - e.timer / B.smashEvery : 0;
      const swipe = e.mode === 'attack' && e.timer > B.swipeEvery - 6 ? 1 : 0;
      const rear = smash < 0.75 ? smash / 0.75 : (1 - smash) / 0.25;
      body.rotation.x = -rear * 0.5 + (e.mode === 'flee' ? 0.12 : 0);
      legs[0]!.rotation.x -= rear * 1.1 + swipe * 1.4;
      legs[1]!.rotation.x -= rear * 1.1;
      head.rotation.x = rear * 0.3 - swipe * 0.4;
      if (e.hp < hp) hurt = 0.35;
      hp = e.hp;
      hurt = Math.max(0, hurt - dt);
      body.position.x = (hurt / 0.35) * Math.sin(t * 50) * 0.05;
    },
  };
}

const WISP_CORE = new THREE.MeshBasicMaterial({ color: '#f2fffb', fog: false, transparent: true });
let WISP_GLOW: THREE.SpriteMaterial | null = null;
const wispGlow = (): THREE.SpriteMaterial =>
  (WISP_GLOW ??= new THREE.SpriteMaterial({ map: glowTexture(), color: '#9ff5e6', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
const CORE_GEO = new THREE.IcosahedronGeometry(0.09, 1);

/** Night Wisp (§14.1): a cold bobbing light with a fainter trailing mote; it brightens while it is luring. */
export function buildWisp(): KindRig {
  const root = new THREE.Group(), orb = new THREE.Group();
  const glow = new THREE.Sprite(wispGlow());
  glow.scale.setScalar(1.3);
  orb.add(glow, new THREE.Mesh(CORE_GEO, WISP_CORE));
  const mote = new THREE.Sprite(wispGlow());
  mote.scale.setScalar(0.45);
  root.add(orb, mote);
  return {
    root,
    animate(e, t) {
      const lure = e.mode === 'lure' ? 1 : 0;
      const y = 1.2 + Math.sin(t * 1.7 + e.id) * 0.18;
      orb.position.set(0, y, 0);
      glow.scale.setScalar((1.2 + lure * 0.4) * (1 + Math.sin(t * 7.3 + e.id * 3) * 0.08));
      mote.position.set(Math.sin(t * 2.1 + e.id) * 0.35, y - 0.15 + Math.cos(t * 2.9) * 0.1, -0.45 + Math.cos(t * 1.4) * 0.15);
    },
  };
}
