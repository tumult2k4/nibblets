import * as THREE from 'three';
import type { Phenotype } from '../sim/goblin/genetics/phenotype';
import { hslToRgb } from '../shared/math';
import type { HSL } from '../shared/types';
import { flatMat, merge, paint } from './lowpoly';

/** Parts of a procedural goblin that goblinView animates (§4.1, §4.5). */
export interface GoblinRig {
  root: THREE.Group; // world position + yaw
  body: THREE.Group; // bob / squash / stoop / lie down
  head: THREE.Group;
  earL: THREE.Object3D; earR: THREE.Object3D;
  armL: THREE.Object3D; armR: THREE.Object3D;
  /** left hand carries loose items; `hand` (right) holds the equipped weapon or tool */
  handL: THREE.Object3D;
  legL: THREE.Object3D; legR: THREE.Object3D;
  hand: THREE.Object3D; // carried prop anchor
  belly: THREE.Mesh;
  eyeMat: THREE.MeshLambertMaterial;
  /** P11.3: the skin color of the shared limb geometry */
  skinMat: THREE.MeshLambertMaterial;
  outline: THREE.Mesh | null;
  triangles: number;
  bucket: string;
}

const rgb = (c: HSL): THREE.Color => new THREE.Color(...hslToRgb(c));

/** Quantize morphology to 8 steps per trait — geometry is rebuilt only when the bucket changes. */
export function phenoBucket(p: Phenotype): string {
  const qz = (v: number, lo: number, hi: number) => Math.round(((v - lo) / (hi - lo)) * 8);
  return [qz(p.earLength, 0.3, 1.6), qz(p.earDroop, 0, 1.3), qz(p.noseSize, 0.6, 1.5), qz(p.headRatio, 0.4, 0.62), p.tusks ? 1 : 0, p.pattern, p.scars,
    Math.round(p.skinColor.h), Math.round(p.skinColor.s * 20), Math.round(p.skinColor.l * 20)].join(':');
}

/** Per-face pattern coloring of a non-indexed geometry (§4.1 skin patterns). */
function patternColors(geo: THREE.BufferGeometry, p: Phenotype, seed: number, isHead: boolean): void {
  const pos = geo.attributes.position!;
  const n = pos.count;
  const skin = rgb(p.skinColor), pat = rgb(p.patternColor);
  const belly = rgb({ h: p.skinColor.h, s: p.skinColor.s * 0.6, l: Math.min(0.9, p.skinColor.l + 0.2) });
  const col = new Float32Array(n * 3);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let f = 0; f < n; f += 3) {
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    let c = skin;
    const r = rnd();
    switch (p.pattern) {
      case 'freckles': if ((isHead ? cz > 0.02 : cy > 0.05) && r < 0.22) c = pat; break;
      case 'spots': if (r < 0.28 && (!isHead || cy > 0)) c = pat; break;
      case 'stripes': if (!isHead && Math.sin(cy * 38 + cx * 4) > 0.35) c = pat; else if (isHead && cy > 0.05 && Math.sin(cx * 30) > 0.5) c = pat; break;
      case 'twotone': if (!isHead && cz > 0.03) c = belly; else if (isHead && cy < -0.03 && cz > 0) c = belly; break;
      default: break;
    }
    const v = (rnd() - 0.5) * 0.04;
    for (let k = 0; k < 3; k++) {
      col[(f + k) * 3] = c.r + v; col[(f + k) * 3 + 1] = c.g + v; col[(f + k) * 3 + 2] = c.b + v;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Pear-shaped, bottom-heavy body (stretched icosahedron, detail 1). */
function bodyGeo(p: Phenotype, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.17, 1);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = y < 0 ? 1.12 : 0.86 - y * 0.8;
    pos.setXYZ(i, pos.getX(i) * k, y * 1.15, pos.getZ(i) * k * (y < 0.02 ? 1.05 : 1));
  }
  patternColors(g, p, seed, false);
  g.computeVertexNormals();
  return g;
}

/**
 * P11.3 geometry cache: legs and arms are the same shape on every goblin, so all goblins share one leg and one arm
 * geometry, shaded in greys and colored by the goblin's own skin material. Shared geometry is never disposed with a rig.
 */
const GREY = new THREE.Color(0.7, 0.7, 0.7), WHITE = new THREE.Color(1, 1, 1);
const sharedGeo = (g: THREE.BufferGeometry): THREE.BufferGeometry => { g.userData.shared = true; return g; };
const LEG = sharedGeo(merge([
  paint(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 3, 1, true).translate(0, -0.06, 0), GREY),
  paint(new THREE.ConeGeometry(0.06, 0.13, 4).rotateX(Math.PI / 2).translate(0, -0.11, 0.04), GREY),
]));
const ARM = sharedGeo(merge([
  paint(new THREE.CylinderGeometry(0.022, 0.026, 0.17, 3, 1, true).translate(0, -0.085, 0), WHITE),
  paint(new THREE.TetrahedronGeometry(0.045).translate(0, -0.18, 0), GREY),
]));

export function buildGoblin(p: Phenotype, seed: number, outlines: boolean): GoblinRig {
  const skin = rgb(p.skinColor);
  const dark = skin.clone().multiplyScalar(0.7);
  const skinMat = flatMat.clone();
  skinMat.color.copy(skin);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  let tris = 0;
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material = flatMat): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    tris += geo.attributes.position!.count / 3;
    parent.add(m);
    return m;
  };
  // legs & feet
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.07], [legR, 0.07]] as const) {
    leg.position.set(x, 0.13, 0);
    add(leg, LEG, skinMat).castShadow = false; // P11.3: thin legs and arms cast no shadow worth a draw
    root.add(leg);
  }
  body.position.y = 0.12;
  const belly = add(body, bodyGeo(p, seed));
  belly.position.y = 0.17;
  // arms with ball hands
  const armL = new THREE.Group(), armR = new THREE.Group();
  const hand = new THREE.Group();
  for (const [arm, x] of [[armL, -0.16], [armR, 0.16]] as const) {
    arm.position.set(x, 0.27, 0);
    add(arm, ARM, skinMat).castShadow = false;
    arm.rotation.z = x < 0 ? -0.25 : 0.25;
    body.add(arm);
  }
  hand.position.set(0, -0.2, 0.05);
  armR.add(hand);
  const handL = new THREE.Group();
  handL.position.set(0, -0.2, 0.05);
  armL.add(handL);
  // head
  const head = new THREE.Group();
  const hr = (p.headRatio * 0.8) / 2;
  head.position.y = 0.36 + hr * 0.75;
  body.add(head);
  const hg = new THREE.IcosahedronGeometry(hr, 1);
  hg.scale(1.08, 0.92, 1);
  patternColors(hg, p, seed + 1, true);
  hg.computeVertexNormals();
  const headParts: THREE.BufferGeometry[] = [hg]; // P11.3: nose and tusks are merged into the head, both eyes into one mesh
  // ears: long sideways cones, droop and notch (scars)
  const earLen = 0.28 * p.earLength;
  const inner = rgb({ h: p.skinColor.h + 10, s: Math.min(1, p.skinColor.s + 0.1), l: Math.min(0.85, p.skinColor.l + 0.12) });
  const mkEar = (side: number): THREE.Object3D => {
    const pivot = new THREE.Group();
    pivot.position.set(side * hr * 0.92, hr * 0.2, -hr * 0.05);
    const ear = merge([
      paint(new THREE.ConeGeometry(0.075, earLen, 4).rotateZ(-side * Math.PI / 2).translate(side * earLen / 2, 0, 0).scale(1, 1.25, 0.4), skin),
      paint(new THREE.ConeGeometry(0.045, earLen * 0.75, 3).rotateZ(-side * Math.PI / 2).translate(side * earLen * 0.42, 0, 0.022).scale(1, 1.25, 0.3), inner),
    ]);
    add(pivot, ear);
    pivot.rotation.z = -side * (0.35 - p.earDroop * 0.6);
    pivot.userData.baseZ = pivot.rotation.z;
    head.add(pivot);
    return pivot;
  };
  const earL = mkEar(-1), earR = mkEar(1);
  // nose: cone, size & droop
  const ns = 0.08 * p.noseSize;
  headParts.push(paint(new THREE.ConeGeometry(ns * 0.6, ns * 1.6, 4).rotateX(Math.PI / 2 + 0.35).translate(0, -hr * 0.12, hr * 0.98 + ns * 0.4), dark.clone().lerp(skin, 0.4)));
  // eyes: octahedra with a dark pupil face; glow at night via emissive
  const eyeCol = rgb(p.eyeColor);
  const eyeMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, emissive: eyeCol, emissiveIntensity: 0 });
  const er = hr * (p.headRatio > 0.5 ? 0.3 : 0.24);
  const eyes: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const eg = new THREE.OctahedronGeometry(er, 0);
    eg.translate(side * hr * 0.38, hr * 0.12, hr * 0.85);
    const pos = eg.attributes.position!;
    const c = new Float32Array(pos.count * 3);
    for (let f = 0; f < pos.count; f += 3) {
      const front = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3 > hr * 0.85 + er * 0.3;
      const cc = front ? eyeCol.clone().multiplyScalar(0.5) : new THREE.Color('#f7f3e6');
      for (let k = 0; k < 3; k++) c.set([cc.r, cc.g, cc.b], (f + k) * 3);
    }
    eg.setAttribute('color', new THREE.BufferAttribute(c, 3));
    eyes.push(eg);
  }
  add(head, merge(eyes), eyeMat).castShadow = false;
  if (p.tusks)
    for (const side of [-1, 1])
      headParts.push(paint(new THREE.ConeGeometry(0.014, 0.05, 3).translate(side * hr * 0.32, -hr * 0.45, hr * 0.8), '#f4ecd2'));
  add(head, merge(headParts));
  // cheap toon outline: slightly scaled backface body (§23.1)
  let outline: THREE.Mesh | null = null;
  if (outlines) {
    outline = new THREE.Mesh(belly.geometry, OUTLINE_MAT);
    outline.scale.setScalar(1.08);
    belly.add(outline);
  }
  return { root, body, head, earL, earR, armL, armR, legL, legR, hand, handL, belly, eyeMat, skinMat, outline, triangles: tris, bucket: phenoBucket(p) };
}

export const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: '#2a2418', side: THREE.BackSide });

export function disposeRig(r: GoblinRig): void {
  r.root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material !== OUTLINE_MAT && !o.geometry.userData.shared) o.geometry.dispose();
  });
  r.eyeMat.dispose();
  r.skinMat.dispose();
}
