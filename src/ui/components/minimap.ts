import { el } from '../dom';
import { geneColor, geneLegend } from '../geneColor';
import { LOCUS_DEFS, type LocusDef, type LocusId } from '../../sim/goblin/genetics/genome';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { LENSES } from '../store';
import { express } from '../../sim/goblin/genetics/phenotype';
import { hslCss } from '../../shared/math';
import { BIOME_COLORS } from '../../render/palette';

/** Minimap (§18.10): terrain, goblin dots in skin color, camera frustum; click to move; lens buttons. */
export class Minimap implements Component {
  private root = el('div.minimap.panel');
  private canvas = el('canvas', { width: 200, height: 200 });
  private lenses = el('div.lenses');
  private terrain: ImageData | null = null;
  private terrainKey = '';
  private dragging = false;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    this.root.append(this.canvas, this.lenses);
    parent.append(this.root);
    const move = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const s = this.ctx.game.world.s.size;
      this.ctx.game.renderer.camera.followId = null;
      this.ctx.game.renderer.camera.setTarget(((e.clientX - r.left) / r.width) * s.w, ((e.clientY - r.top) / r.height) * s.h);
    };
    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.canvas.setPointerCapture(e.pointerId); move(e); });
    this.canvas.addEventListener('pointermove', (e) => this.dragging && move(e));
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
    this.renderLenses();
  }

  /** P9.2: place names on the map, on or off */
  private placesChip(): HTMLElement {
    const st = this.ctx.store.state.settings;
    return el(`button.btn${st.placeNames !== false ? '.on' : ''}`, { onclick: () => { this.ctx.applySettings({ ...this.ctx.store.state.settings, placeNames: st.placeNames === false }); this.renderLenses(); } }, `⚑ ${t('mm.places')}`);
  }

  renderLenses(): void {
    const cur = this.ctx.store.state.lens;
    this.lenses.replaceChildren(el('span.sub', { text: `${t('mm.lens')}:`, style: 'font-size:.75em' }), ...LENSES.map((l) =>
      el(`button.btn${l === cur ? '.on' : ''}`, { onclick: () => this.ctx.store.set({ lens: l }) }, t(`lens.${l}`))), this.placesChip());
    if (cur !== 'genetics') return;
    // genetics lens (P5.9): color by one locus instead of skin hue, with a line on what the colors mean
    const locus = this.ctx.store.state.geneLocus ?? null;
    const legend = el('div.sub.gene-legend', { text: geneLegend(locus) });
    const pick = el('select.gene-pick', { onchange: () => { const v = (pick.value || null) as LocusId | null; this.ctx.store.set({ geneLocus: v }); legend.textContent = geneLegend(v); } },
      el('option', { value: '', text: t('lens.gene.skin') }), ...(LOCUS_DEFS as readonly LocusDef[]).map((d) => el('option', { value: d.key, text: d.label }))) as HTMLSelectElement;
    pick.value = locus ?? '';
    this.lenses.append(el('div.gene-row', {}, pick, legend));
  }

  private buildTerrain(): void {
    const s = this.ctx.game.world.s;
    const img = new ImageData(s.size.w, s.size.h);
    for (let i = 0; i < s.tiles.length; i++) {
      const tl = s.tiles[i]!;
      const c = BIOME_COLORS[tl.biome];
      const shade = 0.75 + tl.height * 0.5;
      img.data[i * 4] = Math.min(255, c.r * 255 * shade);
      img.data[i * 4 + 1] = Math.min(255, c.g * 255 * shade);
      img.data[i * 4 + 2] = Math.min(255, c.b * 255 * shade);
      img.data[i * 4 + 3] = 255;
    }
    this.terrain = img;
    this.canvas.width = s.size.w;
    this.canvas.height = s.size.h;
  }

  update(): void {
    const w = this.ctx.game.world;
    const key = `${w.s.seed}:${w.s.terrainVersion}:${w.s.size.w}:${w.s.preset}`;
    if (key !== this.terrainKey || !this.terrain) {
      this.terrainKey = key;
      this.buildTerrain();
    }
    const c = this.canvas.getContext('2d')!;
    c.putImageData(this.terrain!, 0, 0);
    const sel = new Set(this.ctx.store.state.selection), gene = this.ctx.store.state.lens === 'genetics';
    for (const g of w.s.goblins) {
      c.fillStyle = gene ? geneColor(g.genome, this.ctx.store.state.geneLocus ?? null) : hslCss({ h: express(g.genome, 'skinHue'), s: 0.7, l: 0.5 });
      c.strokeStyle = sel.has(g.id) ? '#fff' : '#2e2a24';
      c.lineWidth = sel.has(g.id) ? 1.2 : 0.6;
      c.beginPath();
      c.arc(g.pos.x, g.pos.y, 1.6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // camera footprint: a rotated trapezoid-ish box around the target
    const cam = this.ctx.game.renderer.camera;
    const r = cam.dist * 0.75;
    c.save();
    c.translate(cam.target.x, cam.target.z);
    c.rotate(-cam.yaw);
    c.strokeStyle = '#fff7e0';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-r * 0.6, r * 0.45);
    c.lineTo(r * 0.6, r * 0.45);
    c.lineTo(r, -r * 0.8);
    c.lineTo(-r, -r * 0.8);
    c.closePath();
    c.stroke();
    c.restore();
  }
}
