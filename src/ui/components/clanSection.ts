/**
 * The rival clans in the Village panel (§16, §18.6 "clan relations", P10.1): each clan the village has met, with its
 * colors (skin hues from its gene pool), how many they are, of what stock and from where, how they stand with the
 * village (a bar from −100 to 100 and a word), what they are known for, how they fare, and their latest news.
 */
import { el } from '../dom';
import { CFG } from '../../sim/config';
import { knownRivals, stanceOf, type ClanNews, type RivalClan } from '../../sim/clans';
import type { WorldState } from '../../sim/state';
import { geneColor } from '../geneColor';
import { t } from '../i18n';

const DAY = CFG.time.dayTicks, NAMED = ['contact', 'raided', 'was_raided', 'allied', 'ally_lost', 'greet', 'trade', 'visit', 'raid', 'slain', 'gift', 'defector'];

function fare(c: RivalClan): string {
  const days = c.store / Math.max(1, c.pop);
  return t(`clan.food.${days < CFG.clans.hungryDays ? 'hungry' : days < CFG.clans.fedDays ? 'lean' : 'fed'}`);
}

function newsLine(s: WorldState, n: ClanNews): string {
  const day = Math.floor(n.tick / DAY) + 1, other = s.rivals.find((o) => o.id === n.other)?.name ?? '?';
  const delta = `${(n.delta ?? 0) > 0 ? '+' : ''}${Math.round(n.delta ?? 0)}`;
  return t(NAMED.includes(n.kind) ? `cnews.${n.kind}` : 'cnews.moved', { day, other, delta });
}

/** −100..100 as a bar from the middle: green to the right, red to the left. */
function bar(rel: number): HTMLElement {
  const k = Math.max(-100, Math.min(100, rel)) / 2;
  const fill = el('div.clan-fill', { style: `left:${k < 0 ? 50 + k : 50}%;width:${Math.abs(k)}%;background:${k < 0 ? '#c0573e' : '#6f9a3c'}` });
  return el('div.clan-bar', {}, fill);
}

function row(s: WorldState, c: RivalClan): HTMLElement {
  const dots = c.pool.slice(0, 4).map((g) => el('span.swatch', { style: `background:${geneColor(g, null)}` }));
  const stance = stanceOf(c);
  return el('div.clan', {},
    el('div.vp-row', {}, el('b', {}, ...dots, ` ${t('clan.title', { name: c.name })}`), el('span', { text: t('clan.relation', { stance: t(`stance.${stance}`), n: Math.round(c.relation) }) })),
    bar(c.relation),
    el('div.sub', { text: `${t('clan.row', { pop: c.pop, stock: t(`stock.${c.archetype}`), from: t(`clan.from.${c.side}`) })} · ${fare(c)}` }),
    el('div.sub', { text: t('clan.traits', { list: c.traits.map((x) => t(`rtrait.${x}`)).join(', ') }) }),
    ...c.news.slice(-2).reverse().map((n) => el('div.sub.clan-news', { text: newsLine(s, n) })),
  );
}

/** The section: a heading, the clans met, and a word on those not met yet. */
export function clanSection(s: WorldState): HTMLElement[] {
  const met = knownRivals(s), more = (s.rivals ?? []).length > met.length;
  return [
    el('h3', { text: t('clans.title') }),
    ...(met.length ? met.map((c) => row(s, c)) : [el('div.sub', { text: t('clans.none') })]),
    ...(met.length && more ? [el('div.sub', { text: t('clans.more') })] : []),
  ];
}
