/** Genetics lens colors (§18.8, P5.9): by skin hue, or by one locus (its allele, carrier status or value). */
import { hslCss } from '../shared/math';
import { LOCUS_BY_ID, type Genome, type LocusId } from '../sim/goblin/genetics/genome';
import { express } from '../sim/goblin/genetics/phenotype';
import { t } from './i18n';

const PATTERN_COLOR = ['#cfc6b4', '#d9934a', '#7b5bd6', '#2f8f6e', '#d64a7a'];
const LOW = { h: 210, s: 0.7, l: 0.5 }, HIGH = { h: 25, s: 0.85, l: 0.55 };

/** The ring color for a goblin with this genome: its pure skin hue (no locus), or how it stands on `locus`. */
export function geneColor(g: Genome, locus: LocusId | null): string {
  if (!locus) return hslCss({ h: express(g, 'skinHue'), s: 0.85, l: 0.55 });
  const d = LOCUS_BY_ID[locus];
  const l = g[locus];
  if (d.kind === 'hue') return hslCss({ h: express(g, locus), s: 0.85, l: 0.55 });
  if (d.kind === 'recessive') return l.a + l.b === 2 ? '#e0503c' : l.a + l.b === 1 ? '#f2c14e' : '#8d8a80';
  if (d.kind === 'discrete') return PATTERN_COLOR[express(g, locus)] ?? '#8d8a80';
  const k = Math.max(0, Math.min(1, (express(g, locus) - d.min) / (d.max - d.min)));
  // low values cool (blue), high values warm (orange), through green and yellow
  return hslCss({ h: LOW.h + (HIGH.h - LOW.h) * k, s: LOW.s + (HIGH.s - LOW.s) * k, l: LOW.l + (HIGH.l - LOW.l) * k });
}

/** One line on what the colors mean. */
export function geneLegend(locus: LocusId | null): string {
  if (!locus) return t('lens.gene.hue');
  const d = LOCUS_BY_ID[locus];
  return d.kind === 'hue' ? t('lens.gene.hue') : d.kind === 'recessive' ? t('lens.gene.recessive') : d.kind === 'discrete' ? t('lens.gene.pattern') : t('lens.gene.quant');
}
