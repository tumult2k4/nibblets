/**
 * Feed notes for culture (P8.5–P8.8): festivals, the chief's speech, beliefs formed and faded, offerings at the
 * shrine and temple, the culture buildings finished, epithets earned; prayers in despair and answered, conversions,
 * the shaman, the group prayer, the god's name. Called from `noteFor` for the events it leaves to it.
 */
import type { ID, SimEvent } from '../shared/types';
import type { World } from '../sim/world';
import type { Note } from './notify';
import { getLang, godNameText, t } from './i18n';

/** A name with its epithet (P8.7), worded for the language: "Grubnok the Brave", "Old Mogwick". */
export const withEpithet = (name: string, epithet: string | null): string => (epithet ? t(`epithet.${epithet}`, { name }) : name);

/** "Holding a festival brings rain." */
export const beliefText = (omen: string, luck: string): string => t('belief.sentence', { omen: t(`omen.${omen}`), luck: t(`luck.${luck}`) });

/** A building's name inside a sentence ("at the shrine", "am Schrein"). */
const placeName = (k: string): string => (getLang() === 'en' ? t(`bld.${k}`).toLowerCase() : t(`bld.${k}`));

/** "Pipnok prays for rain: the land is parched." */
export function prayerText(kind: string, name: string, target?: string): string {
  return t(kind === 'healing' && target && target !== name ? 'prayer.healing.other' : `prayer.${kind}`, { name, target: target ?? '' });
}

export function cultureNote(e: SimEvent, w: World, base: { tick: number }, name: (id?: ID) => string): Note | null {
  switch (e.type) {
    case 'festival': // P8.5
      return { ...base, text: t(e.phase === 'start' ? `ev.festival.${e.kind}` : 'ev.festival_end', { fest: t(`fest.${e.kind}`), n: e.came ?? 0 }), tier: e.phase === 'start' ? 'notable' : 'info', icon: 'star' };
    case 'festival_speech':
      return { ...base, id: e.goblinId, text: t('ev.festival_speech', { name: name(e.goblinId) }), tier: 'info', icon: 'star' };
    case 'superstition_formed': // P8.6
    case 'superstition_faded':
      return { ...base, text: t(e.type === 'superstition_formed' ? 'ev.belief_formed' : 'ev.belief_faded', { belief: beliefText(e.omen, e.luck) }), tier: e.type === 'superstition_formed' ? 'notable' : 'info', icon: e.valence > 0 ? 'sun' : 'moon' };
    case 'epithet_earned': // P8.7
      return { ...base, id: e.goblinId, text: t('ev.epithet', { name: name(e.goblinId), full: withEpithet(name(e.goblinId), e.epithet) }), tier: 'notable', icon: 'star' };
    case 'decorated': {
      const k = w.s.buildings.find((b) => b.id === e.buildingId)?.type;
      return k === 'shrine' || k === 'temple'
        ? { ...base, id: e.goblinId, text: t(k === 'shrine' ? 'ev.offering' : 'ev.offering_temple', { name: name(e.goblinId) }), tier: 'info', icon: 'gem' } : null;
    }
    case 'building_completed':
      return ['music_circle', 'shrine', 'totem', 'temple'].includes(e.kind) ? { ...base, text: t(`ev.built.${e.kind}`), tier: 'notable', icon: e.kind === 'music_circle' ? 'star' : 'sparkle' } : null;
    case 'prayer': // P8.8
      return e.desperate ? { ...base, id: e.goblinId, text: t('ev.prayer_desperate', { what: prayerText(e.kind, name(e.goblinId), e.targetId !== undefined ? name(e.targetId) : undefined) }), tier: 'notable', icon: 'sparkle' } : null;
    case 'prayer_answered':
      return { ...base, id: e.goblinId, text: t('ev.prayer_answered', { name: name(e.goblinId) }), tier: 'notable', icon: 'sparkle' };
    case 'converted':
      return { ...base, id: e.goblinId, text: t('ev.converted', { name: name(e.goblinId) }), tier: 'info', icon: 'sparkle' };
    case 'shaman_chosen':
      return { ...base, id: e.goblinId, text: t(e.previousId === null ? 'ev.shaman_first' : 'ev.shaman_chosen', { name: name(e.goblinId) }), tier: 'notable', icon: 'star' };
    case 'god_named':
      return { ...base, text: t('ev.god_named', { name: godNameText(e.name) }), tier: 'notable', icon: 'sun' };
    case 'group_prayer':
      return { ...base, id: e.goblinId, text: t('ev.group_prayer', { name: name(e.goblinId) }), tier: 'info', icon: 'sparkle' };
    case 'offering':
      return { ...base, id: e.goblinId, text: t('ev.offering_food', { name: name(e.goblinId), place: placeName(w.s.buildings.find((b) => b.id === e.buildingId)?.type ?? 'shrine') }), tier: 'info', icon: 'gift' };
    default:
      return null;
  }
}
