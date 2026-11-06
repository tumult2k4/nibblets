/** Feed notes for the rival clans (§16, P10.1): first contact, raids among them (when the village knows both), and
 * an alliance made or broken. Called from `cultureNote` for the clan events. */
import type { SimEvent } from '../shared/types';
import type { World } from '../sim/world';
import type { Note } from './notify';
import { t } from './i18n';

export function clanNote(e: SimEvent, w: World, base: { tick: number }): Note | null {
  if (e.type !== 'clan_contact' && e.type !== 'clan_raid' && e.type !== 'clan_alliance') return null;
  const clan = (id: number) => w.s.rivals.find((c) => c.id === id);
  const a = clan(e.clanA);
  if (!a) return null;
  if (e.type === 'clan_contact') return { ...base, text: t('ev.clan_contact', { clan: a.name, at: t(`clan.at.${a.side}`) }), tier: 'notable', icon: 'eye' };
  if (e.type === 'clan_alliance') return { ...base, text: t(e.ended ? 'ev.clan_alliance_end' : 'ev.clan_alliance', { clan: a.name }), tier: 'notable', icon: e.ended ? 'close' : 'heart' };
  const b = clan(e.clanB);
  return b && a.contact !== null && b.contact !== null ? { ...base, text: t('ev.clan_raid', { a: a.name, b: b.name }), tier: 'info', icon: 'spear' } : null;
}
