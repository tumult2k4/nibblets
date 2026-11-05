/**
 * Egg inspector (§18.6, P5.9): whose it is, how close to hatching and how warm, and the fun reveal: the child inside,
 * as a hatchling and grown up, with its whole genome.
 */
import { el } from '../../dom';
import { t } from '../../i18n';
import { icon } from '../../icons';
import type { Egg } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { CFG } from '../../../sim/config';
import { bodyWarm } from '../../../sim/goblin/family';
import { express, phenotypeOf, PATTERNS } from '../../../sim/goblin/genetics/phenotype';
import { portraits } from '../../../render/portraits';
import { bar, genomeTable } from './goblinInspector';
import { kinChip } from './socialTab';

const F = CFG.family, DAY = CFG.time.dayTicks;

export function eggHead(egg: Egg, onClose: () => void): HTMLElement {
  return el('div.insp-head', {}, icon('egg', 'portrait'),
    el('div', { style: 'flex:1' }, el('h2', { text: t('insp.egg') }),
      el('div.sub', { text: egg.twinOf !== undefined ? t('insp.eggTwin') : t('insp.eggOne') }),
      el('button.btn', { onclick: onClose, 'data-tip': t('insp.close') }, icon('close'))));
}

/** What the child inside will look like, in a few plain words. */
function looks(egg: Egg): string {
  const g = egg.genome, parts = [`${Math.round(express(g, 'skinHue'))}°`];
  const pat = PATTERNS[express(g, 'pattern')] ?? 'none';
  if (pat !== 'none') parts.push(t(`pattern.${pat}`));
  if (express(g, 'albino')) parts.push(t('tree.locus.albino'));
  if (express(g, 'tusks')) parts.push(t('tree.locus.tusks'));
  const size = express(g, 'adultSize');
  if (size > 1.15) parts.push(t('insp.eggBig'));
  else if (size < 0.88) parts.push(t('insp.eggSmall'));
  return parts.join(' · ');
}

export function eggBody(egg: Egg, w: World, onPick: (id: number) => void): HTMLElement {
  const need = F.incubateDays * DAY, frac = Math.max(0, egg.incubation / need);
  const left = Math.max(0, need - egg.incubation);
  const warm = egg.warmth >= 0.5;
  const sitter = bodyWarm(w, egg);
  const parents = egg.parents.filter((id) => id >= 0);
  const pic = (age: number, stage: 'hatchling' | 'adult', full: boolean) =>
    el('img.egg-peek', { src: portraits.get(phenotypeOf({ genome: egg.genome, ageDays: age, stage, hunger: 70, scars: 0 }), egg.id * 31 + 7, 0.35, full), alt: '' });
  return el('div', {},
    el('h3', { text: t('insp.parents') }),
    parents.length ? el('div.kins', {}, ...parents.map((id) => kinChip(w, id, onPick))) : el('div.sub', { text: t('insp.eggNobody') }),
    el('h3', { text: t('insp.incubation') }),
    el('div.row', {}, el('span.lbl', { text: t('insp.hatching') }), bar(frac * 100, 'var(--gold)'),
      el('span.val', { text: frac >= 1 ? '—' : `${(left / CFG.god.hourTicks).toFixed(0)} h` })),
    el('div.row', {}, el('span.lbl', { text: t('insp.warmth') }), bar(egg.warmth * 100, warm ? 'var(--apple)' : 'var(--sky)'),
      el('span.val', { text: warm ? t('insp.eggWarm') : t('insp.eggCold') })),
    el('div.sub', { text: sitter ? t('insp.eggSat') : warm ? t('insp.eggSnug') : t('insp.eggChill', { h: Math.max(0, Math.round((egg.incubation + F.lostColdDays * DAY) / CFG.god.hourTicks)) }) }),
    el('h3', { text: t('insp.eggInside') }),
    el('div.egg-reveal', {}, el('div', {}, pic(1, 'hatchling', true), el('div.sub', { text: t('stage.hatchling') })),
      el('div', {}, pic(25, 'adult', true), el('div.sub', { text: t('insp.grownUp') }))),
    el('div.sub', { text: looks(egg) }),
    el('h3', { text: t('insp.genome') }), genomeTable(egg.genome));
}
