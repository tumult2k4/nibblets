/**
 * Feed notes for culture (P8.5–P8.7): festivals, the chief's speech, beliefs formed and faded, offerings at the
 * shrine, the culture buildings finished, epithets earned. Called from `noteFor` for the events it leaves to it.
 */
import type { ID, SimEvent } from '../shared/types';
import type { World } from '../sim/world';
import type { Note } from './notify';
import { t } from './i18n';

/** A name with its epithet (P8.7), worded for the language: "Grubnok the Brave", "Old Mogwick". */
export const withEpithet = (name: string, epithet: string | null): string => (epithet ? t(`epithet.${epithet}`, { name }) : name);

/** "Holding a festival brings rain." */
export const beliefText = (omen: string, luck: string): string => t('belief.sentence', { omen: t(`omen.${omen}`), luck: t(`luck.${luck}`) });

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
    case 'decorated':
      return w.s.buildings.find((b) => b.id === e.buildingId)?.type === 'shrine'
        ? { ...base, id: e.goblinId, text: t('ev.offering', { name: name(e.goblinId) }), tier: 'info', icon: 'gem' } : null;
    case 'building_completed':
      return e.kind === 'music_circle' || e.kind === 'shrine' || e.kind === 'totem' ? { ...base, text: t(`ev.built.${e.kind}`), tier: 'notable', icon: e.kind === 'music_circle' ? 'star' : 'sparkle' } : null;
    default:
      return null;
  }
}
