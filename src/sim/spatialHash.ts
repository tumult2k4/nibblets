import type { ID, Vec2 } from '../shared/types';

interface Entry { id: ID; pos: Vec2 }

/** Uniform-grid spatial hash. Query results are sorted by id for determinism. */
export class SpatialHash<T extends Entry> {
  private cells = new Map<number, T[]>();
  constructor(private cellSize = 4) {}

  private key(cx: number, cy: number): number {
    return (cy + 1024) * 4096 + (cx + 1024);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(e: T): void {
    const k = this.key(Math.floor(e.pos.x / this.cellSize), Math.floor(e.pos.y / this.cellSize));
    let arr = this.cells.get(k);
    if (!arr) this.cells.set(k, (arr = []));
    arr.push(e);
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
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const e of arr) {
          const d2 = (e.pos.x - p.x) ** 2 + (e.pos.y - p.y) ** 2;
          if (d2 <= r2 && (!filter || filter(e))) out.push(e);
        }
      }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  /** Nearest entry within radius r (ties broken by id). */
  nearest(p: Vec2, r: number, filter?: (e: T) => boolean): T | null {
    let best: T | null = null;
    let bd = Infinity;
    for (const e of this.query(p, r, filter)) {
      const d = (e.pos.x - p.x) ** 2 + (e.pos.y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
}
