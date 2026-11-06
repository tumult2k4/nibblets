import type { World } from '../sim/world';
import { heightAt } from '../sim/grid';
import { CFG } from '../sim/config';
import { elevation } from '../sim/watch';
import { climbing } from '../sim/steering';
import type { Goblin } from '../sim/state';

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

  /** Up a watchtower, or halfway over a fence (P5.7). */
  private lift(g: Goblin): number {
    return elevation(g, this.w) + (climbing(this.w, g.pos) ? 0.25 : 0);
  }

  /** Call after each sim tick. */
  capture(): void {
    this.prev = this.cur;
    const cur = new Map<number, P3>();
    const s = this.w.s;
    for (const g of s.goblins)
      cur.set(g.id, { x: g.pos.x, y: g.pos.y, z: g.airborne ? g.airborne.z : this.alt(g.pos.x, g.pos.y) + this.lift(g), facing: g.facing });
    for (const v of s.visitors ?? []) cur.set(v.id, { x: v.pos.x, y: v.pos.y, z: this.alt(v.pos.x, v.pos.y), facing: v.facing });
    for (const e of s.enemies) cur.set(e.id, { x: e.pos.x, y: e.pos.y, z: this.alt(e.pos.x, e.pos.y), facing: e.facing });
    const sea = CFG.world.waterLevel * CFG.world.heightScale;
    for (const c of s.wildlife) cur.set(c.id, { x: c.pos.x, y: c.pos.y, z: Math.max(sea, this.alt(c.pos.x, c.pos.y)), facing: c.heading });
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
