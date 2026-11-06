/** Feed notes for the rival clans (§16, P10.1–P10.4): first contact, raids among them (when the village knows both)
 * and on the village, an alliance made or broken, their scouts and traders, trade, the chief's gifts, exiles who
 * went over to a clan, allies' suitors and warriors, and marriages either way. Called from `cultureNote`. */
import type { ID, SimEvent, TradeGood } from '../shared/types';
import type { World } from '../sim/world';
import { visitorById, type Goods } from '../sim/visitors';
import type { Note } from './notify';
import { getLang, t } from './i18n';

const word = (key: string): string => (getLang() === 'en' ? t(key).toLowerCase() : t(key));

/** Goods in a sentence: "flint ×3", "a crystal", "how to make a stone spear". */
export function goodsText(x: TradeGood | Goods): string {
  const item = 'item' in x ? x.item : 'type' in x && x.type ? { type: x.type, qty: x.qty ?? 1 } : undefined;
  if (item) return item.qty > 1 ? `${word(`item.${item.type}`)} ×${item.qty}` : word(`item.${item.type}`);
  if (x.recipe) return t('visitor.recipe', { what: word(`recipe.${x.recipe}`) });
  return x.trinket ? word(`trinket.${x.trinket}`) : '?';
}

export function clanNote(e: SimEvent, w: World, base: { tick: number }, name: (id?: ID) => string): Note | null {
  const clan = (id: number | undefined) => w.s.rivals.find((c) => c.id === id);
  if (e.type === 'visitor_arrived' || e.type === 'visitor_left') {
    const c = clan(e.clanId), v = visitorById(w.s, e.visitorId);
    if (!c) return null;
    if (e.type === 'visitor_left') return e.kind === 'trader' ? { ...base, text: t('ev.trader_left', { clan: c.name }), tier: 'info', icon: 'leaf' } : null;
    if (e.kind === 'scout') return { ...base, at: e.at, text: t('ev.scout', { clan: c.name }), tier: 'notable', icon: 'eye' };
    if (e.kind === 'suitor') return { ...base, at: e.at, text: t('ev.suitor', { clan: c.name }), tier: 'notable', icon: 'heart' }; // P10.4
    if (e.kind === 'warrior') { // one note for the band (they come together; the first of them speaks)
      const first = (w.s.visitors ?? []).filter((x) => x.kind === 'warrior' && x.clanId === c.id).sort((a, b) => a.id - b.id)[0];
      return !first || first.id === e.visitorId ? { ...base, at: e.at, text: t('ev.allies_help', { clan: c.name }), tier: 'notable', icon: 'spear' } : null;
    }
    const list = (v?.offers ?? []).map((o) => goodsText(o.give)).join(', ');
    return { ...base, at: e.at, text: t('ev.trader', { clan: c.name, list }), tier: 'notable', icon: 'gift' };
  }
  if (e.type === 'traded') {
    const c = clan(e.clanId), gave = goodsText(e.gave), got = goodsText(e.got);
    return { ...base, id: e.goblinId, text: c ? t('ev.traded_visitor', { name: name(e.goblinId), gave, got, clan: c.name }) : t('ev.traded', { name: name(e.goblinId), other: name(e.withId), gave, got }), tier: 'info', icon: 'gift' };
  }
  if (e.type === 'clan_gift' || e.type === 'goblin_left' || e.type === 'goblin_joined') { // P10.3, P10.4
    const c = clan(e.clanId);
    if (!c) return null;
    if (e.type === 'clan_gift') return { ...base, id: e.goblinId, text: t('ev.gift_sent', { name: name(e.goblinId), what: goodsText(e.gave), clan: c.name }), tier: 'info', icon: 'gift' };
    if (e.type === 'goblin_joined') {
      const n = name(e.goblinId), parts = [t('ev.joined', { name: n, clan: c.name })];
      if (e.matchId !== undefined) parts.push(t('ev.joined_match', { name: n, match: name(e.matchId) }));
      if (e.recipes.length) parts.push(t('ev.joined_recipes', { name: n, list: e.recipes.map((r) => word(`recipe.${r}`)).join(', ') }));
      return { ...base, id: e.goblinId, at: e.at, text: parts.join(' '), tier: 'notable', icon: 'heart' };
    }
    return { ...base, text: t(e.why === 'defected' ? 'ev.defected' : 'ev.married_out', { name: name(e.goblinId), clan: c.name }), tier: 'notable', icon: e.why === 'defected' ? 'leaf' : 'heart' };
  }
  if (e.type !== 'clan_contact' && e.type !== 'clan_raid' && e.type !== 'clan_alliance') return null;
  const a = clan(e.clanA);
  if (!a) return null;
  if (e.type === 'clan_contact') return { ...base, text: t('ev.clan_contact', { clan: a.name, at: t(`clan.at.${a.side}`) }), tier: 'notable', icon: 'eye' };
  if (e.type === 'clan_alliance') return { ...base, text: t(e.ended ? 'ev.clan_alliance_end' : 'ev.clan_alliance', { clan: a.name }), tier: 'notable', icon: e.ended ? 'close' : 'heart' };
  if (e.clanB === w.s.clans[0]?.id) return { ...base, at: e.at, text: t('ev.raid', { clan: a.name, from: t(`clan.from.${a.side}`) }), tier: 'critical', icon: 'spear' };
  const b = clan(e.clanB);
  return b && a.contact !== null && b.contact !== null ? { ...base, text: t('ev.clan_raid', { a: a.name, b: b.name }), tier: 'info', icon: 'spear' } : null;
}
