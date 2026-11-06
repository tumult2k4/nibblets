import { el } from '../dom';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { clanStats, generations, RECESSIVE } from '../../sim/goblin/lineage';
import { phenotypeOf } from '../../sim/goblin/genetics/phenotype';
import { ageDays } from '../../sim/goblin/goblin';
import { portraits } from '../../render/portraits';
import type { ID } from '../../shared/types';
import type { WorldState } from '../../sim/state';

const DX = 74, DY = 96, R = 24;
interface Node { id: ID; x: number; y: number; gen: number }

/**
 * Family tree (K, §13.4, §18.7): every goblin that ever lived, a row per generation from the founders down, each a
 * swatch in its true skin color (a portrait for the living; the dead greyed with a skull), lines up to its parents.
 * Drag to pan, wheel to zoom, click to select and fly to. The filter rings the carriers of a recessive allele (tusks,
 * albino) gold and those who show it red, the dead included; the clan line gives depth, births and average hue.
 */
export class FamilyTree implements Component {
  private root = el('div.familytree.panel.hidden');
  private canvas = el('canvas') as HTMLCanvasElement;
  private stats = el('div.sub');
  private filter = el('select') as HTMLSelectElement;
  private nodes: Node[] = [];
  private sig = '';
  private view = { x: 0, y: 0, k: 1 };
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private imgs = new Map<ID, { src: string; img: HTMLImageElement }>();
  private lastDraw = 0;
  private centeredOn: ID | null = null;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { 'data-tip': tipKey(t('insp.close'), keyLabel('family')), onclick: () => this.setOpen(false) }, '✕');
    this.filter.append(el('option', { value: '', text: t('tree.noFilter') }), ...RECESSIVE.map((k) => el('option', { value: k, text: t('tree.carriers', { trait: t(`tree.locus.${k}`) }) })));
    this.filter.onchange = () => this.draw();
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('tree.title') }), this.filter, close), this.stats, this.canvas, el('div.sub', { text: t('tree.hint') }));
    parent.append(this.root);
    const c = this.canvas;
    c.width = 620; c.height = 360;
    c.onpointerdown = (e) => { this.drag = { x: e.offsetX, y: e.offsetY, moved: false }; c.setPointerCapture(e.pointerId); };
    c.onpointermove = (e) => {
      if (!this.drag) return;
      const dx = e.offsetX - this.drag.x, dy = e.offsetY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.view.x += dx; this.view.y += dy;
      this.drag.x = e.offsetX; this.drag.y = e.offsetY;
      this.draw();
    };
    c.onpointerup = (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) this.click(e.offsetX, e.offsetY);
    };
    c.onwheel = (e) => {
      e.preventDefault();
      const k = Math.min(2.5, Math.max(0.25, this.view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      // zoom about the cursor
      this.view.x = e.offsetX - ((e.offsetX - this.view.x) * k) / this.view.k;
      this.view.y = e.offsetY - ((e.offsetY - this.view.y) * k) / this.view.k;
      this.view.k = k;
      this.draw();
    };
  }

  private setOpen(open: boolean): void {
    this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, family: open } });
  }

  update(): void {
    const st = this.ctx.store.state;
    const open = !!st.openPanels.family;
    this.root.classList.toggle('hidden', !open);
    if (!open) { this.centeredOn = null; return; }
    const s = this.ctx.game.world.s;
    const sig = `${Object.keys(s.lineage).length}:${s.goblins.length}:${st.settings.language}`;
    if (sig !== this.sig) { this.sig = sig; this.layout(s); }
    const focus = st.familyFocus ?? null;
    if (focus !== null && focus !== this.centeredOn) { this.centeredOn = focus; this.centerOn(focus); }
    const now = performance.now();
    if (now - this.lastDraw > 2000) this.draw(); // ages, deaths and portraits change slowly
  }

  /** Rows by generation; each row ordered by where its parents stand, mates side by side, so lines cross as little as they can. */
  private layout(s: WorldState): void {
    const gen = generations(s);
    const rows = new Map<number, ID[]>();
    for (const [id, g] of gen) (rows.get(g) ?? rows.set(g, []).get(g)!).push(id);
    const mates = new Map<ID, ID>();
    for (const e of Object.values(s.lineage)) if (e.parents) { const [p, q] = e.parents; if (!mates.has(p)) mates.set(p, q); if (!mates.has(q)) mates.set(q, p); }
    const xOf = new Map<ID, number>();
    this.nodes = [];
    for (const g of [...rows.keys()].sort((a, b) => a - b)) {
      const ids = rows.get(g)!, inRow = new Set(ids);
      const bary = (id: ID) => {
        const ps = (s.lineage[id]?.parents ?? []).map((p) => xOf.get(p)).filter((x): x is number => x !== undefined);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : (s.lineage[id]?.clan ?? 0) * 1000 + id * 1e-3;
      };
      ids.sort((a, b) => bary(a) - bary(b) || a - b);
      const order: ID[] = [], placed = new Set<ID>();
      for (const id of ids) {
        if (placed.has(id)) continue;
        order.push(id); placed.add(id);
        const m = mates.get(id);
        if (m !== undefined && inRow.has(m) && !placed.has(m)) { order.push(m); placed.add(m); }
      }
      order.forEach((id, i) => {
        const x = (i - (order.length - 1) / 2) * DX;
        xOf.set(id, x);
        this.nodes.push({ id, x, y: g * DY, gen: g });
      });
    }
    const cs = clanStats(s);
    this.stats.textContent = cs.map((c) => t('tree.clanLine', { clan: c.name, g: c.generations, n: c.descendants, h: c.avgHue === null ? '—' : Math.round(c.avgHue) })).join(' · ');
    if (this.centeredOn === null) this.fit();
    this.draw();
  }

  /** Zoom out until the widest row fits (down to half size), top row at the top. */
  private fit(): void {
    const xs = this.nodes.map((n) => n.x), c = this.canvas;
    const span = xs.length ? Math.max(...xs) - Math.min(...xs) + DX : DX;
    const k = Math.min(1, Math.max(0.5, (c.width - 20) / span));
    this.view = { x: c.width / 2, y: (R + 12) * k, k };
  }

  private centerOn(id: ID): void {
    const n = this.nodes.find((x) => x.id === id);
    if (!n) return;
    this.view = { x: this.canvas.width / 2 - n.x, y: this.canvas.height / 2 - n.y, k: 1 };
    this.draw();
  }

  private click(px: number, py: number): void {
    const x = (px - this.view.x) / this.view.k, y = (py - this.view.y) / this.view.k;
    const n = this.nodes.find((o) => Math.hypot(o.x - x, o.y - y) <= R);
    if (!n) return;
    const g = this.ctx.game.world.goblin(n.id);
    if (!g) return;
    this.ctx.select('goblin', [g.id]);
    this.ctx.flyTo(g.pos);
  }

  /** A living goblin's portrait (cached; re-rendered when its look changes). */
  private portrait(id: ID): HTMLImageElement | null {
    const w = this.ctx.game.world, g = w.goblin(id);
    if (!g) return null;
    const src = portraits.get(phenotypeOf({ genome: g.genome, ageDays: ageDays(g, w.s.tick), stage: g.lifeStage, hunger: 70, scars: g.health.scars }), g.id * 31 + 7);
    let hit = this.imgs.get(id);
    if (!hit || hit.src !== src) {
      const img = new Image();
      img.onload = () => this.draw();
      img.src = src;
      this.imgs.set(id, (hit = { src, img }));
    }
    return hit.img.complete ? hit.img : null;
  }

  private draw(): void {
    this.lastDraw = performance.now();
    const c = this.canvas, x = c.getContext('2d');
    if (!x) return;
    const s = this.ctx.game.world.s, by = new Map(this.nodes.map((n) => [n.id, n]));
    const locus = this.filter.value, sel = this.ctx.store.state.selection[0];
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.setTransform(this.view.k, 0, 0, this.view.k, this.view.x, this.view.y);
    // a soft curve from each parent down to each child
    x.strokeStyle = '#8a7a5e';
    x.lineWidth = 1.5;
    x.beginPath();
    for (const n of this.nodes) {
      for (const pid of s.lineage[n.id]?.parents ?? []) {
        const p = by.get(pid);
        if (!p) continue;
        const y0 = p.y + R, y1 = n.y - R, my = (y0 + y1) / 2;
        x.moveTo(p.x, y0); x.bezierCurveTo(p.x, my, n.x, my, n.x, y1);
      }
    }
    x.stroke();
    x.font = '11px Fredoka, sans-serif';
    x.textAlign = 'center';
    for (const n of this.nodes) {
      const e = s.lineage[n.id]!, dead = e.died !== null, gone = !dead && e.left !== undefined; // P10.3: left for a rival clan
      const [h, sat, l] = e.skin ?? [e.hue, 0.55, 0.5];
      x.globalAlpha = dead ? 0.45 : gone ? 0.7 : 1;
      x.fillStyle = `hsl(${h} ${Math.round((dead ? sat * 0.4 : sat) * 100)}% ${Math.round(l * 100)}%)`;
      x.beginPath(); x.arc(n.x, n.y, R, 0, Math.PI * 2); x.fill();
      const img = dead ? null : this.portrait(n.id);
      if (img) {
        x.save(); x.beginPath(); x.arc(n.x, n.y, R - 2, 0, Math.PI * 2); x.clip();
        x.drawImage(img, n.x - R * 1.15, n.y - R * 1.15, R * 2.3, R * 2.3);
        x.restore();
      }
      // filter ring: carriers gold, those who show it red; unknown (old saves) dashed grey
      const count = locus ? e.rec?.[locus] : undefined;
      x.lineWidth = n.id === sel ? 4 : 2;
      x.setLineDash(locus && count === undefined ? [3, 3] : []);
      x.strokeStyle = locus && count === 2 ? '#c8452d' : locus && count === 1 ? '#e8b64c' : n.id === sel ? '#2e6fb5' : '#4a3420';
      if (locus && count !== undefined && count > 0) x.lineWidth = 4;
      x.beginPath(); x.arc(n.x, n.y, R, 0, Math.PI * 2); x.stroke();
      x.setLineDash([]);
      x.lineWidth = 3; x.strokeStyle = '#f6edd9'; x.lineJoin = 'round';
      x.strokeText(e.name, n.x, n.y + R + 12); // a halo, so the name reads over the lines
      x.fillStyle = '#2e2a24';
      x.fillText(e.name, n.x, n.y + R + 12);
      if (dead || gone) x.fillText(dead ? '☠' : '↗', n.x + R * 0.8, n.y - R * 0.7);
      x.globalAlpha = 1;
    }
  }
}
