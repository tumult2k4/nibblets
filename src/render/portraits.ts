import * as THREE from 'three';
import type { Phenotype } from '../sim/goblin/genetics/phenotype';
import { buildGoblin, disposeRig, phenoBucket } from './goblinMesh';

/** Offscreen 128×128 goblin portraits, cached per phenotype bucket (§23.3). */
class PortraitRenderer {
  private gl: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private cache = new Map<string, string>();

  private init(): THREE.WebGLRenderer {
    if (this.gl) return this.gl;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.gl.setSize(128, 128, false);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight('#e6f2ff', '#6b7a45', 1.4));
    const d = new THREE.DirectionalLight('#fff3d6', 1.6);
    d.position.set(2, 3, 4);
    this.scene.add(d);
    return this.gl;
  }

  /** Data URL of a portrait; `angle` rotates the goblin (wizard uses it for slow turning). */
  get(p: Phenotype, seed: number, angle = 0.35, full = false): string {
    const key = `${phenoBucket(p)}|${p.scale.toFixed(2)}|${seed}|${angle.toFixed(2)}|${full}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const gl = this.init();
    const rig = buildGoblin({ ...p, scale: 1 }, seed, false);
    rig.root.rotation.y = angle;
    rig.eyeMat.emissiveIntensity = 0.2;
    this.scene.add(rig.root);
    const headY = 0.12 + 0.36 + (p.headRatio * 0.8) / 2 * 0.75;
    if (full) {
      this.cam.position.set(0, 0.5, 2.3);
      this.cam.lookAt(0, 0.4, 0);
    } else {
      this.cam.position.set(0, headY + 0.05, 1.35);
      this.cam.lookAt(0, headY - 0.05, 0);
    }
    gl.setClearColor(0x000000, 0);
    gl.render(this.scene, this.cam);
    const url = gl.domElement.toDataURL('image/png');
    this.scene.remove(rig.root);
    disposeRig(rig);
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, url);
    return url;
  }
}

export const portraits = new PortraitRenderer();
