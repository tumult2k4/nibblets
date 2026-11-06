/**
 * Grave inspector (§18.6, P6.4): who lies here, when they lived, what took them, their family, what was buried with
 * them, who still grieves, and (when an elder has spoken, P9) the eulogy. P6.6: while the body is kept (two days),
 * a Resurrect button — greyed with the reason when the god cannot do it yet (tier, favor, cooldown).
 */
import { el } from '../../dom';
import { t } from '../../i18n';
import { tipKey } from '../tooltip';
import { icon } from '../../icons';
import type { Grave } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { CFG } from '../../../sim/config';
import { clockAt } from '../../../sim/time';
import { griefId } from '../../../sim/death';
import { kinChip } from './socialTab';
import { castProblem } from '../../../sim/god/cast';
import { resurrectProblem } from '../../../sim/god/powers/miracles';
import { withEpithet } from '../../notifyCulture';
import { journalsOf } from '../../../llm/store';
import { nameOf } from '../../../llm/describe';

const DAY = CFG.time.dayTicks;

const when = (tick: number): string => {
  const c = clockAt(tick);
  return `${t('top.day', { season: t(`season.${c.season}`), day: c.seasonDay + 1 })} · ${t('top.year', { year: c.year })}`;
};

export function graveHead(gr: Grave, onClose: () => void): HTMLElement {
  return el('div.insp-head', {}, icon('skull', 'portrait'),
    el('div', { style: 'flex:1' }, el('h2', { text: withEpithet(gr.name, gr.epithet) }),
      el('div.sub', { text: t(`grave.state.${gr.state}`) }),
      el('button.btn', { onclick: onClose, 'data-tip': tipKey(t('insp.close'), 'Esc') }, icon('close'))));
}

/** The Resurrect button while the body is kept, or null; `cast` is null when the god cannot act (replays, observer). */
function resurrectRow(gr: Grave, w: World, cast: (() => void) | null): HTMLElement | null {
  if (resurrectProblem(w, gr.id)) return null;
  const left = Math.max(0, Math.ceil((gr.tick + CFG.death.resurrectDays * DAY - w.s.tick) / CFG.god.hourTicks));
  const why = castProblem(w, 'resurrect', gr.pos, undefined, gr.id);
  const b = el('button.btn', { disabled: !cast || !!why, onclick: () => cast?.() }, icon('star'), ` ${t('grave.resurrect')}`);
  b.dataset.tip = why ? t(`reason.${why}`) : t('grave.resurrectLeft', { h: left });
  return el('div.row', {}, b);
}

export function graveBody(gr: Grave, w: World, onPick: (id: number) => void, cast: (() => void) | null = null): HTMLElement {
  const row = (label: string, text: string) => el('div.row', {}, el('span.lbl', { text: label }), el('span', { text }));
  const chips = (label: string, ids: number[]) => ids.length ? el('div.row.kinrow', {}, el('span.lbl', { text: label }), el('span.kins', {}, ...ids.map((id) => kinChip(w, id, onPick)))) : null;
  const line = w.s.lineage[gr.goblinId];
  const parents = line?.parents?.filter((id) => id >= 0) ?? [];
  const children = Object.entries(w.s.lineage).filter(([, e]) => e.parents?.includes(gr.goblinId)).map(([id]) => Number(id));
  const grieving = w.s.goblins.filter((g) => g.mood.modifiers.some((m) => m.id === griefId(gr.goblinId))).map((g) => g.id);
  const goods = gr.goods !== null ? w.s.trinkets.find((x) => x.id === gr.goods) : undefined;
  const seasons = Math.max(0, (gr.tick - gr.born) / DAY / CFG.time.daysPerSeason);
  return el('div', {},
    row(t('grave.born'), gr.born < 0 ? t('grave.founder') : when(gr.born)),
    row(t('grave.died'), when(gr.tick)),
    row(t('grave.lived'), t('grave.seasons', { n: seasons < 1 ? seasons.toFixed(1) : Math.round(seasons) })),
    row(t('grave.cause'), t(`cause.${gr.cause}`)),
    row(t('grave.goods'), goods ? `${t(`trinket.${goods.kind}`)} (${t(`rarity.${goods.rarity}`)})` : t('grave.noGoods')),
    chips(t('insp.parents'), parents), chips(t('insp.children'), children),
    grieving.length ? chips(t('grave.mourners'), grieving) : el('div.sub', { text: t('grave.noMourners') }),
    el('h3', { text: t('grave.eulogy') }),
    eulogyOf(gr, w),
    resurrectRow(gr, w, cast));
}

/** The eulogy (P9.5): what the elder said at the funeral, from the journals. */
function eulogyOf(gr: Grave, w: World): HTMLElement {
  const e = journalsOf(w.s, gr.goblinId, 'eulogy').pop();
  if (!e) return el('p.sub', { text: gr.eulogy ?? t('grave.noEulogy') });
  return el('p.sub', {}, el('b', { text: t('grave.eulogyBy', { name: nameOf(w.s, e.by) ?? '?' }) }), ` ${e.text}`, e.source === 'mock' ? el('span.jmock', { 'data-tip': t('journal.mock'), text: ' ✎' }) : null);
}
