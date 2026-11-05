/** Inspector "Social" tab (§18.6, P5.1): whom this goblin knows, how it feels about them, and the bond between them. */
import { el } from '../../dom';
import { t } from '../../i18n';
import type { Goblin } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { isKin } from '../../../sim/goblin/social';
import { icon } from '../../icons';

const BOND_ICON: Record<string, string> = { friend: 'heart', best_friend: 'star', rival: 'bolt', enemy: 'skull', mate: 'heart', parent: 'egg', child: 'egg', sibling: 'egg' };

/** An opinion bar centered on 0: green to the right for liking, red to the left for disliking. */
function opinionBar(v: number): HTMLElement {
  const w = Math.min(50, Math.abs(v) / 2);
  const style = v >= 0 ? `left:50%;width:${w}%;background:var(--moss)` : `left:${50 - w}%;width:${w}%;background:var(--apple)`;
  return el('div.bar', { style: 'position:relative' }, el('i', { style: `position:absolute;top:0;bottom:0;${style}` }));
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
  return el('div', {},
    el('h3', { text: t('insp.relations') }),
    el('div.sub', { text: t('insp.relationsLine', { f: bonds('friend') + bonds('best_friend'), b: bonds('best_friend'), r: bonds('rival') + bonds('enemy'), g: g.deeds.gifts }) }),
    ...(rows.length ? rows : [el('div.sub', { text: t('insp.knowsNobody') })]));
}
