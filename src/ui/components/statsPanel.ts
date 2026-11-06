import { el } from '../dom';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { t } from '../i18n';
import { chartCanvas, drawLines, drawStack } from '../chart';
import { bandColor, statsData } from '../statsData';
import type { Ctx, Component } from '../ctx';

const W = 320, H = 92;
const CAUSE_COLORS = ['#c8452d', '#7a4fa0', '#7fb3d5', '#e8b64c', '#6e8b3d', '#8a6a50', '#d07ab0', '#4a7a8c', '#a3a07a'];

/**
 * Stats panel (P7.6, key O, or from the village panel): line charts of the population, the days of food in the store
 * and what the village knows, the skin-hue mix over time (the founders' colors drifting as generations pass) and
 * deaths by cause. Redrawn whenever a new sample comes in (every 300 ticks).
 */
export class StatsPanel implements Component {
  private root = el('div.statspanel.panel.hidden');
  private body = el('div');
  private lastKey = '';

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { 'data-tip': tipKey(t('insp.close'), keyLabel('stats')), onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, stats: false } }) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('stats.title') }), close), this.body);
    parent.append(this.root);
  }

  update(): void {
    const open = !!this.ctx.store.state.openPanels.stats;
    this.root.classList.toggle('hidden', !open);
    const s = this.ctx.game.world.s;
    const key = `${s.stats.samples.length}:${s.stats.samples[s.stats.samples.length - 1]?.tick}:${s.stats.deathLog?.length ?? 0}`;
    if (!open || key === this.lastKey) return;
    this.lastKey = key;
    const d = statsData(s);
    if (d.days.length < 2) {
      this.body.replaceChildren(el('div.sub', { text: t('stats.empty') }));
      return;
    }
    const chart = (title: string, draw: (cv: HTMLCanvasElement) => void, legend?: HTMLElement): HTMLElement[] => {
      const cv = chartCanvas(W, H);
      draw(cv);
      return [el('h3', { text: title }), cv, ...(legend ? [legend] : [])];
    };
    const last = (xs: number[]): number => xs[xs.length - 1] ?? 0;
    const deathLines = d.deaths.map((x, i) => ({ label: t(`cause.${x.cause}`), color: CAUSE_COLORS[i % CAUSE_COLORS.length]!, values: x.values }));
    this.body.replaceChildren(
      ...chart(t('stats.pop', { n: last(d.pop) }), (cv) => drawLines(cv, d.days, [{ label: 'pop', color: '#6e8b3d', values: d.pop }], { width: W, height: H })),
      ...chart(t('stats.food', { n: last(d.food).toFixed(1) }), (cv) => drawLines(cv, d.days, [{ label: 'food', color: '#c8452d', values: d.food }], { width: W, height: H })),
      ...chart(t('stats.hues'), (cv) => drawStack(cv, d.days, d.hues.map((values, b) => ({ color: bandColor(b), values })), { width: W, height: H })),
      ...chart(t('stats.deaths', { n: deathLines.reduce((n, l) => n + last(l.values), 0) }), (cv) => drawLines(cv, d.days, deathLines, { width: W, height: H, step: true }),
        deathLines.length ? el('div.st-legend', {}, ...deathLines.map((l) => el('span', {}, el('i', { style: `background:${l.color}` }), `${l.label} ${last(l.values)}`))) : el('div.sub', { text: t('stats.noDeaths') })),
      ...chart(t('stats.known', { n: last(d.known) }), (cv) => drawLines(cv, d.days, [{ label: 'known', color: '#7a4fa0', values: d.known }], { width: W, height: H, step: true })),
    );
  }
}
