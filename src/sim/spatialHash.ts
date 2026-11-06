import type { ID, Vec2 } from '../shared/types';

interface Entry { id: ID; pos: Vec2 }

/** Uniform-grid spatial hash. Query results are sorted by id for determinism. */
export class SpatialHash<T extends Entry> {
  private cells = new Map<number, T[]>();
  private items: T[] = [];
  private cellX: number[] = []; // each item's cell, as it was put in (goblins move on; the cell stays)
  private cellY: number[] = [];
  private byId = true; // items went in in id order
  private subs = new Map<string, SpatialHash<T>>();
  constructor(private cellSize = 4) {}

  /**
   * The entries passing `pred` in a coarser hash of their own (P11.3: "flowers near here" without walking past every
   * bush). Made on first use and kept until this hash changes; `pred` must read only what never changes (a kind).
   */
  subset(key: string, pred: (e: T) => boolean, cellSize = 8): SpatialHash<T> {
    let h = this.subs.get(key);
    if (!h) {
      h = new SpatialHash<T>(cellSize);
      h.rebuild(this.items.filter(pred));
      this.subs.set(key, h);
    }
    return h;
  }

  private key(cx: number, cy: number): number {
    return (cy + 1024) * 4096 + (cx + 1024);
  }

  clear(): void {
    this.cells.clear();
    this.items = [];
    this.cellX = [];
    this.cellY = [];
    this.byId = true;
    this.subs.clear();
  }

  insert(e: T): void {
    const cx = Math.floor(e.pos.x / this.cellSize), cy = Math.floor(e.pos.y / this.cellSize), k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) this.cells.set(k, (arr = []));
    arr.push(e);
    const last = this.items[this.items.length - 1];
    if (last && last.id > e.id) this.byId = false;
    this.items.push(e);
    this.cellX.push(cx);
    this.cellY.push(cy);
    if (this.subs.size) this.subs.clear();
  }

  /**
   * P11.3: when a search would look in more cells than it is worth, it walks the list instead, taking exactly what the
   * cells would give (an item counts by the cell it was put in) and, the list being in id order, needing no sort.
   */
  private walk(x0: number, x1: number, y0: number, y1: number): boolean {
    return this.byId && (x1 - x0 + 1) * (y1 - y0 + 1) * 4 > this.items.length;
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (const e of items) this.insert(e);
  }

  /** All entries within radius r of p, sorted by id. */
  query(p: Vec2, r: number, filter?: (e: T) => boolean): T[] {
    const out: T[] = [];
    const cs = this.cellSize;
    const x0 = Math.floor((p.x - r) / cs);
    const x1 = Math.floor((p.x + r) / cs);
    const y0 = Math.floor((p.y - r) / cs);
    const y1 = Math.floor((p.y + r) / cs);
    const r2 = r * r;
    if (this.walk(x0, x1, y0, y1)) {
      const its = this.items, X = this.cellX, Y = this.cellY;
      for (let i = 0; i < its.length; i++) {
        if (X[i]! < x0 || X[i]! > x1 || Y[i]! < y0 || Y[i]! > y1) continue;
        const e = its[i]!, dx = e.pos.x - p.x, dy = e.pos.y - p.y;
        if (dx * dx + dy * dy <= r2 && (!filter || filter(e))) out.push(e);
      }
      return out;
    }
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const e of arr) {
          const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
          if (dx * dx + dy * dy <= r2 && (!filter || filter(e))) out.push(e);
        }
      }
    if (out.length > 1) out.sort((a, b) => a.id - b.id);
    return out;
  }

  /** How many entries within radius r pass `filter`, counting no further than `max` (P11.3: no list). */
  count(p: Vec2, r: number, max: number, filter?: (e: T) => boolean): number {
    const cs = this.cellSize, r2 = r * r;
    let n = 0;
    for (let cy = Math.floor((p.y - r) / cs); cy <= Math.floor((p.y + r) / cs); cy++)
      for (let cx = Math.floor((p.x - r) / cs); cx <= Math.floor((p.x + r) / cs); cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const e of arr) {
          const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
          if (dx * dx + dy * dy <= r2 && (!filter || filter(e)) && ++n >= max) return n;
        }
      }
    return n;
  }

  /** Nearest entry within radius r (ties broken by id). Scans the cells in place (P11.3: no list, no sort). */
  nearest(p: Vec2, r: number, filter?: (e: T) => boolean): T | null {
    let best: T | null = null;
    let bd = r * r;
    const cs = this.cellSize;
    const x0 = Math.floor((p.x - r) / cs), x1 = Math.floor((p.x + r) / cs), y0 = Math.floor((p.y - r) / cs), y1 = Math.floor((p.y + r) / cs);
    const take = (e: T): void => {
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = dx * dx + dy * dy;
      if (d > bd || (d === bd && best && e.id >= best.id) || (filter && !filter(e))) return;
      bd = d;
      best = e;
    };
    if (this.walk(x0, x1, y0, y1)) {
      const its = this.items, X = this.cellX, Y = this.cellY;
      for (let i = 0; i < its.length; i++) if (X[i]! >= x0 && X[i]! <= x1 && Y[i]! >= y0 && Y[i]! <= y1) take(its[i]!);
      return best;
    }
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const e of arr) take(e);
      }
    return best;
  }
}
