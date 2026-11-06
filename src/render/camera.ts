import * as THREE from 'three';
import { clamp } from '../shared/math';
import type { WorldState } from '../sim/state';
import { heightAt } from '../sim/grid';
import { CFG } from '../sim/config';

/** Orbit camera with damping, zoom 6–90, pitch 25°–80°, terrain collision, fly-to and follow (§18.12); freer in photo mode. */
const LIMITS = { play: { p0: 25, p1: 80, d0: 6, d1: 90, clear: 1.2 }, free: { p0: 4, p1: 86, d0: 2.5, d1: 140, clear: 0.35 } };
const RAD = Math.PI / 180;

/**
 * Screen-relative pan: dz < 0 moves toward where the camera looks (projected onto the ground), dx > 0 to screen right.
 * The camera sits at target + (sin yaw, ·, cos yaw), so ground forward is (-sin, -cos) and right is (cos, -sin).
 */
export function panDelta(yaw: number, dx: number, dz: number): { x: number; z: number } {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return { x: dx * c + dz * sn, z: dz * c - dx * sn };
}

export class OrbitCam {
  readonly cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  private goal = new THREE.Vector3();
  yaw = Math.PI * 0.25;
  pitch = 0.9;
  dist = 34;
  private goalDist = 34;
  private goalYaw = this.yaw;
  private goalPitch = this.pitch;
  private fly: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  followId: number | null = null;
  autoOrbit = 0;
  shake = 0;
  private lim = LIMITS.play;

  constructor(aspect: number, private s: () => WorldState) {
    this.cam = new THREE.PerspectiveCamera(45, aspect, 0.1, 900);
  }

  setTarget(x: number, z: number, instant = false): void {
    this.goal.set(x, this.groundY(x, z), z);
    if (instant) this.target.copy(this.goal);
  }

  private groundY(x: number, z: number): number {
    return Math.max(heightAt(this.s(), { x, y: z }), CFG.world.waterLevel) * CFG.world.heightScale;
  }

  pan(dx: number, dz: number): void {
    this.followId = null;
    this.fly = null;
    const k = this.dist * 0.0018;
    const d = panDelta(this.yaw, dx, dz); // the yaw on screen, so W follows the view even mid-rotation
    const nx = this.goal.x + d.x * k * 10;
    const nz = this.goal.z + d.z * k * 10;
    const w = this.s().size;
    this.setTarget(clamp(nx, 0, w.w), clamp(nz, 0, w.h));
  }

  orbit(dYaw: number, dPitch: number): void {
    this.goalYaw += dYaw;
    this.goalPitch = clamp(this.goalPitch + dPitch, this.lim.p0 * RAD, this.lim.p1 * RAD);
  }

  zoom(factor: number): void {
    this.goalDist = clamp(this.goalDist * factor, this.lim.d0, this.lim.d1);
  }

  /** Photo mode (P11.2): closer, lower and farther than in play; back within the play limits after. */
  setFree(on: boolean): void {
    this.lim = on ? LIMITS.free : LIMITS.play;
    this.orbit(0, 0);
    this.zoom(1);
  }

  flyTo(x: number, z: number): void {
    this.fly = { from: this.goal.clone(), to: new THREE.Vector3(x, this.groundY(x, z), z), t: 0 };
  }

  update(dt: number, followPos: { x: number; z: number } | null): void {
    if (this.autoOrbit) this.goalYaw += this.autoOrbit * dt;
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / 0.8);
      const e = this.fly.t < 0.5 ? 2 * this.fly.t ** 2 : 1 - (-2 * this.fly.t + 2) ** 2 / 2;
      this.goal.lerpVectors(this.fly.from, this.fly.to, e);
      if (this.fly.t >= 1) this.fly = null;
    } else if (followPos) this.setTarget(followPos.x, followPos.z);
    const k = 1 - Math.exp(-dt * 8);
    this.target.lerp(this.goal, k);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    this.dist += (this.goalDist - this.dist) * k;
    const off = new THREE.Vector3(Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch) * Math.cos(this.yaw)).multiplyScalar(this.dist);
    const pos = this.target.clone().add(off);
    const minY = this.groundY(pos.x, pos.z) + this.lim.clear;
    if (pos.y < minY) pos.y = minY;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      pos.x += (Math.random() - 0.5) * this.shake;
      pos.y += (Math.random() - 0.5) * this.shake;
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(this.target);
  }
}
