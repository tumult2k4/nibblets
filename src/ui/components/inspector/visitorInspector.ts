/**
 * Visitor inspector (P10.2): a stranger from a rival clan, with its own face (from its genome), what it is (scout or
 * trader) and of which clan, how that clan stands with the village, whether it is coming, visiting or going home,
 * who greeted it, and a trader's offers (struck ones marked).
 */
import { el } from '../../dom';
import { t } from '../../i18n';
import { tipKey } from '../tooltip';
import { icon } from '../../icons';
import type { World } from '../../../sim/world';
import { clockAt } from '../../../sim/time';
import { phenotypeOf } from '../../../sim/goblin/genetics/phenotype';
import { stanceOf } from '../../../sim/clans';
import { clanOf, type Visitor } from '../../../sim/visitors';
import { portraits } from '../../../render/portraits';
import { goodsText } from '../../notifyClans';

export function visitorHead(v: Visitor, w: World, onFollow: () => void, onClose: () => void): HTMLElement {
  const ph = phenotypeOf({ genome: v.genome, ageDays: 20, stage: 'adult', hunger: 70, scars: 0 });
  const c = clanOf(w.s, v);
  return el('div.insp-head', {}, el('img.portrait', { src: portraits.get(ph, v.id * 31 + 7), alt: v.name }),
    el('div', { style: 'flex:1' },
      el('h2', { text: v.name }),
      el('div.sub.badge', { text: t('visitor.of', { kind: t(`visitor.${v.kind}`), clan: c?.name ?? '?' }) }),
      c ? el('div.sub', { text: t('visitor.stance', { stance: t(`stance.${stanceOf(c)}`) }) }) : null,
      el('div', { style: 'margin-top:4px;display:flex;gap:4px' },
        el('button.btn', { onclick: onFollow, 'data-tip': t('insp.follow') }, icon('eye')),
        el('button.btn', { onclick: onClose, 'data-tip': tipKey(t('insp.close'), 'Esc') }, icon('close')))));
}

export function visitorBody(v: Visitor): HTMLElement[] {
  const hour = (clockAt(v.leaveAt).hour + 24) % 24;
  const phase = v.phase === 'staying' ? t('visitor.staying', { hour: String(Math.floor(hour)).padStart(2, '0') }) : t(`visitor.${v.phase}`);
  const out: HTMLElement[] = [el('div.row', { text: phase })];
  if (v.greeted.length) out.push(el('div.row', { text: t('visitor.greeted', { n: v.greeted.length }) }));
  if (v.offers.length) {
    out.push(el('h3', { text: t('visitor.offers') }));
    for (const o of v.offers) {
      const line = t('visitor.offer', { give: goodsText(o.give), want: goodsText(o.want.qty ? { type: o.want.type, qty: o.want.qty } : {}) });
      out.push(el(`div.row${o.done ? '.muted' : ''}`, {}, icon(o.give.recipe ? 'book' : o.give.trinket ? 'gem' : 'gift'), el('span', { text: o.done ? `${line} ${t('visitor.done')}` : line })));
    }
  }
  return out;
}
