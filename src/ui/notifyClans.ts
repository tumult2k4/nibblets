/** Feed notes for the rival clans (§16, P10.1–P10.3): first contact, raids among them (when the village knows both)
 * and on the village, an alliance made or broken, their scouts and traders, trade, the chief's gifts and exiles who
 * went over to a clan. Called from `cultureNote`. */
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
    const list = (v?.offers ?? []).map((o) => goodsText(o.give)).join(', ');
    return { ...base, at: e.at, text: t('ev.trader', { clan: c.name, list }), tier: 'notable', icon: 'gift' };
  }
  if (e.type === 'traded') {
    const c = clan(e.clanId), gave = goodsText(e.gave), got = goodsText(e.got);
    return { ...base, id: e.goblinId, text: c ? t('ev.traded_visitor', { name: name(e.goblinId), gave, got, clan: c.name }) : t('ev.traded', { name: name(e.goblinId), other: name(e.withId), gave, got }), tier: 'info', icon: 'gift' };
  }
  if (e.type === 'clan_gift' || e.type === 'goblin_left') { // P10.3
    const c = clan(e.clanId);
    if (!c) return null;
    if (e.type === 'clan_gift') return { ...base, id: e.goblinId, text: t('ev.gift_sent', { name: name(e.goblinId), what: goodsText(e.gave), clan: c.name }), tier: 'info', icon: 'gift' };
    return e.why === 'defected' ? { ...base, text: t('ev.defected', { name: name(e.goblinId), clan: c.name }), tier: 'notable', icon: 'leaf' } : null;
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
