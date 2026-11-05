/** Inspector "Social" tab (§18.6, P5.1): whom this goblin knows, how it feels about them, and the bond between them. */
import { el } from '../../dom';
import { t } from '../../i18n';
import type { Goblin } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { isKin } from '../../../sim/goblin/social';
import { mateOf } from '../../../sim/goblin/family';
import { icon } from '../../icons';
import type { ID } from '../../../shared/types';

const BOND_ICON: Record<string, string> = { friend: 'heart', best_friend: 'star', rival: 'bolt', enemy: 'skull', mate: 'heart', parent: 'egg', child: 'egg', sibling: 'egg' };

/** An opinion bar centered on 0: green to the right for liking, red to the left for disliking. */
function opinionBar(v: number): HTMLElement {
  const w = Math.min(50, Math.abs(v) / 2);
  const style = v >= 0 ? `left:50%;width:${w}%;background:var(--moss)` : `left:${50 - w}%;width:${w}%;background:var(--apple)`;
  return el('div.bar', { style: 'position:relative' }, el('i', { style: `position:absolute;top:0;bottom:0;${style}` }));
}

/** One relative as a chip in its true skin color; the living are clickable, the dead greyed with a skull. */
export function kinChip(w: World, id: ID, onPick: (id: number) => void): HTMLElement {
  const e = w.s.lineage[id], alive = w.goblin(id);
  const [h, sat, l] = e?.skin ?? [e?.hue ?? 120, 0.55, 0.5];
  const dead = !alive;
  return el(`span.kin${dead ? '.dead' : ''}`, { onclick: alive ? () => onPick(id) : undefined },
    el('span.swatch', { style: `background:hsl(${h} ${Math.round(sat * (dead ? 40 : 100))}% ${Math.round(l * 100)}%)` }),
    `${alive?.name ?? e?.name ?? '?'}${dead ? ' ☠' : ''}`);
}

/** Parents, mate, children and siblings, the dead among them from the lineage book. */
function familyBlock(g: Goblin, w: World, onPick: (id: number) => void): HTMLElement[] {
  const book = w.s.lineage, parents: readonly ID[] = g.parents ?? [];
  const ids = Object.keys(book).map(Number);
  const children = ids.filter((id) => book[id]!.parents?.includes(g.id));
  const siblings = ids.filter((id) => id !== g.id && book[id]!.parents?.some((p) => parents.includes(p)));
  const mate = mateOf(g, w);
  const line = (label: string, list: ID[]) => list.length
    ? el('div.row.kinrow', {}, el('span.lbl', { text: label }), el('span.kins', {}, ...list.map((id) => kinChip(w, id, onPick)))) : null;
  const rows = [line(t('insp.parents'), [...parents]), line(t('insp.mate'), mate ? [mate.id] : []), line(t('insp.children'), children), line(t('insp.siblings'), siblings)]
    .filter((r): r is HTMLDivElement => !!r);
  return [el('h3', { text: t('insp.family') }), ...(rows.length ? rows : [el('div.sub', { text: t('insp.noFamily') })])];
}

export function socialTab(g: Goblin, w: World, onPick: (id: number) => void): HTMLElement {
  const rows = [...g.relationships]
    .map((r) => ({ r, o: w.goblin(r.targetId) }))
    .filter((x) => x.o)
    .sort((a, b) => Math.abs(b.r.opinion) - Math.abs(a.r.opinion) || b.r.familiarity - a.r.familiarity)
    .slice(0, 14)
    .map(({ r, o }) => {
      const kin = isKin(g, o!);
      const bond = r.bond !== 'none' ? r.bond : kin ? 'sibling' : 'none';
      return el('div.row', { style: 'cursor:pointer', onclick: () => onPick(o!.id), 'data-tip': t('insp.familiarity', { n: Math.round(r.familiarity) }) },
        bond !== 'none' ? icon(BOND_ICON[bond] ?? 'goblin') : el('span', { style: 'width:18px;display:inline-block' }),
        el('span.lbl', { text: o!.name }), opinionBar(r.opinion),
        el('span.val', { text: `${r.opinion > 0 ? '+' : ''}${Math.round(r.opinion)}` }));
    });
  const bonds = (k: string) => g.relationships.filter((r) => r.bond === k).length;
  return el('div', {}, ...familyBlock(g, w, onPick),
    el('h3', { text: t('insp.relations') }),
    el('div.sub', { text: t('insp.relationsLine', { f: bonds('friend') + bonds('best_friend'), b: bonds('best_friend'), r: bonds('rival') + bonds('enemy'), g: g.deeds.gifts }) }),
    ...(rows.length ? rows : [el('div.sub', { text: t('insp.knowsNobody') })]));
}
