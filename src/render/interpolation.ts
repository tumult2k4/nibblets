import type { World } from '../sim/world';
import { heightAt } from '../sim/grid';
import { CFG } from '../sim/config';

export interface P3 { x: number; y: number; z: number; facing: number }

/**
 * Keeps the previous and current sim snapshot of moving entities and lerps between them by
 * accumulator / tickDuration (§3.1). z is world altitude.
 */
export class Interp {
  private prev = new Map<number, P3>();
  private cur = new Map<number, P3>();

  constructor(private w: World) {
    this.capture();
    this.capture();
  }

  private alt(x: number, y: number): number {
    return heightAt(this.w.s, { x, y }) * CFG.world.heightScale;
  }

  /** Call after each sim tick. */
  capture(): void {
    this.prev = this.cur;
    const cur = new Map<number, P3>();
    const s = this.w.s;
    for (const g of s.goblins)
      cur.set(g.id, { x: g.pos.x, y: g.pos.y, z: g.airborne ? g.airborne.z : this.alt(g.pos.x, g.pos.y), facing: g.facing });
    for (const e of s.enemies) cur.set(e.id, { x: e.pos.x, y: e.pos.y, z: this.alt(e.pos.x, e.pos.y), facing: e.facing });
    for (const it of s.groundItems)
      cur.set(it.id, { x: it.pos.x, y: it.pos.y, z: it.airborne ? it.airborne.z : this.alt(it.pos.x, it.pos.y), facing: 0 });
    this.cur = cur;
  }

  get(id: number, alpha: number): P3 | null {
    const c = this.cur.get(id);
    if (!c) return null;
    const p = this.prev.get(id) ?? c;
    let df = c.facing - p.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    return { x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha, z: p.z + (c.z - p.z) * alpha, facing: p.facing + df * alpha };
  }
}
