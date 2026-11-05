/** Small inline SVG charts for the goblin inspector (§18.6, P5.8): personality radar and size growth curve. */
import { el } from '../../dom';
import { t } from '../../i18n';
import type { Goblin } from '../../../sim/state';
import { TRAITS } from '../../../sim/goblin/personality';
import { express, growthCurve, lifeStageForAge } from '../../../sim/goblin/genetics/phenotype';
import { CFG } from '../../../sim/config';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const f1 = (v: number): string => v.toFixed(1);

/** Personality as a radar: one spoke per trait, 0 at the hub, 1 at the rim. */
export function personalityRadar(g: Goblin): HTMLElement {
  const cx = 110, cy = 78, r = 54, n = TRAITS.length;
  const at = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v];
  };
  const ring = (v: number) => TRAITS.map((_, i) => at(i, v).map(f1).join(',')).join(' ');
  const spokes = TRAITS.map((_, i) => { const [x, y] = at(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${f1(x)}" y2="${f1(y)}"/>`; }).join('');
  const shape = TRAITS.map((k, i) => at(i, Math.max(0.04, g.personality[k])).map(f1).join(',')).join(' ');
  const labels = TRAITS.map((k, i) => {
    const [x, y] = at(i, 1.22);
    const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${f1(x)}" y="${f1(y + 3)}" text-anchor="${anchor}"><title>${g.personality[k].toFixed(2)}</title>${esc(t(`trait.${k}`))}</text>`;
  }).join('');
  return el('div.chart', { html:
    `<svg viewBox="0 0 220 156" role="img" aria-label="${esc(t('insp.personality'))}">`
    + `<g class="grid">${[0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${ring(v)}"/>`).join('')}${spokes}</g>`
    + `<polygon class="shape" points="${shape}"/><g class="lbl">${labels}</g></svg>` });
}

/** Body size by age, from hatching to old age, with a dot where it stands now. */
export function growthChart(g: Goblin, age: number): HTMLElement {
  const end = Math.max(g.lifespanDays, age + 1), size = express(g.genome, 'adultSize');
  const scaleAt = (d: number) => growthCurve(d, lifeStageForAge(d, g.lifespanDays)).scale * size;
  const W = 200, H = 64, L = 18, B = 14, top = 1.4;
  const px = (d: number) => L + (d / end) * (W - L - 4), py = (v: number) => H - B - (v / top) * (H - B - 4);
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) { const d = (i / 80) * end; pts.push(`${f1(px(d))},${f1(py(scaleAt(d)))}`); }
  const S = CFG.goblin.stageDays;
  const ticks = [S.hatchling, S.youngling, Math.min(S.adultUntil, g.lifespanDays * 0.8)].filter((d) => d < end)
    .map((d) => `<line class="mark" x1="${f1(px(d))}" y1="4" x2="${f1(px(d))}" y2="${H - B}"/>`).join('');
  const now = Math.min(age, end);
  return el('div.chart', { html:
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('insp.growth'))}">`
    + `<line class="axis" x1="${L}" y1="${H - B}" x2="${W - 4}" y2="${H - B}"/><line class="axis" x1="${L}" y1="4" x2="${L}" y2="${H - B}"/>`
    + `${ticks}<polyline class="curve" points="${pts.join(' ')}"/>`
    + `<circle class="now" cx="${f1(px(now))}" cy="${f1(py(scaleAt(now)))}" r="3.2"/>`
    + `<text x="${L - 3}" y="${f1(py(1) + 3)}" text-anchor="end">1</text>`
    + `<text x="${W - 4}" y="${H - 2}" text-anchor="end">${Math.round(end / CFG.time.daysPerSeason)} ${esc(t('insp.seasons'))}</text></svg>` });
}
