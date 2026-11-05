import * as THREE from 'three';
import type { ClockState } from '../sim/time';
import { daylight } from '../sim/time';
import { SKY } from './palette';

const GREY = new THREE.Color('#8a929c'), HAZE = new THREE.Color('#f3e2b8'), FLASH = new THREE.Color('#eef2ff');

/** Gradient sky dome, stars, sun/moon lights and fog that follow the clock (§23.1). */
export class SkyLights {
  readonly group = new THREE.Group();
  readonly hemi = new THREE.HemisphereLight('#cfe8ff', '#5a6b3a', 0.9);
  readonly sun = new THREE.DirectionalLight('#fff3d6', 1.6);
  private dome: THREE.Mesh;
  private uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  private stars: THREE.Points;
  readonly fogColor = new THREE.Color();
  /** 0..1 used by goblin eyes & windows */
  night = 0;

  constructor(shadows: boolean) {
    const geo = new THREE.SphereGeometry(400, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
      vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying float vY;
        void main(){ float t = clamp(pow(max(vY,0.0),0.6),0.0,1.0); gl_FragColor = vec4(mix(horizon, top, t),1.0); }`,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.renderOrder = -1;
    this.group.add(this.dome);
    const pts: number[] = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
      pts.push(Math.sin(ph) * Math.cos(th) * 380, Math.cos(ph) * 380, Math.sin(ph) * Math.sin(th) * 380);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fffbe8', size: 1.6, sizeAttenuation: false, transparent: true, fog: false }));
    this.group.add(this.stars);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
  }

  /** `overcast` (−0.15 heat haze … 1 storm) greys and dims the sky; `flash` is a lightning flash 0..1 (P3.7). */
  update(c: ClockState, target: THREE.Vector3, camPos: THREE.Vector3, overcast = 0, flash = 0): void {
    const dl = daylight(c);
    this.night = 1 - dl;
    const duskness = c.phase === 'dusk' || c.phase === 'dawn' ? 0.7 : 0;
    const top = SKY.night.top.clone().lerp(SKY.day.top, dl).lerp(SKY.dusk.top, duskness * 0.5);
    const hor = SKY.night.horizon.clone().lerp(SKY.day.horizon, dl).lerp(SKY.dusk.horizon, duskness);
    const oc = Math.max(0, overcast);
    if (oc > 0) {
      const grey = GREY.clone().multiplyScalar(0.25 + 0.75 * dl);
      top.lerp(grey, oc * 0.85);
      hor.lerp(grey, oc * 0.6);
    } else if (overcast < 0) hor.lerp(HAZE, -overcast * 2 * dl);
    if (flash > 0) { top.lerp(FLASH, flash * 0.7); hor.lerp(FLASH, flash * 0.5); }
    this.uniforms.top.value.copy(top);
    this.uniforms.horizon.value.copy(hor);
    this.fogColor.copy(hor);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - dl * 1.6) * (1 - oc);
    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);
    // sun arc: rises at dawn (dayFrac 0) and sets at dusk end (0.7); moon the rest
    const isDay = c.dayFrac < 0.7;
    const t = isDay ? c.dayFrac / 0.7 : (c.dayFrac - 0.7) / 0.3;
    const ang = t * Math.PI;
    const dir = new THREE.Vector3(Math.cos(ang) * 60, Math.sin(ang) * 70 + 12, 30);
    this.sun.position.copy(target).add(dir);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    if (isDay) {
      this.sun.color.set(duskness ? '#ffc890' : '#fff3d6');
      this.sun.intensity = (0.35 + 1.35 * dl) * (1 - 0.85 * oc);
    } else {
      this.sun.color.set('#9fb4ff');
      this.sun.intensity = 0.28;
    }
    this.hemi.intensity = (0.35 + 0.65 * dl) * (1 - 0.5 * oc) + flash * 1.6;
    this.hemi.color.copy(new THREE.Color('#5d6fa8').lerp(new THREE.Color('#d6ecff'), dl));
    this.hemi.groundColor.copy(new THREE.Color('#1f2635').lerp(new THREE.Color('#6b7a45'), dl));
  }
}
