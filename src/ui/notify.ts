import type { SimEvent, Vec2, ID } from '../shared/types';
import type { World } from '../sim/world';
import { t } from './i18n';
import { ITEM_ICON } from './icons';
import { CFG } from '../sim/config';
import { fenceSites } from '../sim/fences';

/** The last open post on the ring was just finished. */
const fenceJustClosed = (w: World): boolean =>
  w.s.village.fenceRing > 0 && !fenceSites(w, 1).length && !w.s.buildings.some((b) => b.type === 'fence' && b.buildProgress < 1);

export interface Note { text: string; tier: 'info' | 'notable' | 'critical'; at?: Vec2; id?: ID; tick: number; icon: string }

/** Turn sim events into player-facing notifications (§18.9). Returns null for routine events. */
export function noteFor(e: SimEvent, w: World, names: Map<ID, string>): Note | null {
  const name = (id?: ID) => (id !== undefined ? names.get(id) ?? w.goblin(id)?.name ?? '?' : '?');
  const foe = (id: ID) => t(`enemy.${w.s.enemies.find((x) => x.id === id)?.kind ?? 'gnasher'}`);
  const base = { tick: e.tick, ...(e.at ? { at: e.at } : {}) };
  switch (e.type) {
    case 'goblin_died':
      return { ...base, id: e.goblinId, text: t('ev.goblin_died', { name: name(e.goblinId), cause: t(`cause.${e.cause}`) }), tier: 'critical', icon: 'skull' };
    case 'life_stage':
      return { ...base, id: e.goblinId, text: t('ev.life_stage', { name: name(e.goblinId), stage: t(`stage.${e.stage}`) }), tier: 'notable', icon: 'goblin' };
    case 'season_changed':
      return { ...base, text: t('ev.season_changed', { season: t(`season.${e.season}`), year: e.year }), tier: 'notable', icon: 'leaf' };
    case 'day_started':
      return { ...base, text: t('ev.day', { day: e.day + 1 }), tier: 'info', icon: 'sun' };
    case 'divine_act':
      if (e.act === 'gift')
        return { ...base, ...(e.targetId !== undefined ? { id: e.targetId } : {}), text: e.targetId !== undefined ? t('ev.gift', { name: name(e.targetId) }) : t('ev.gift_none'), tier: 'info', icon: 'gift' };
      if (e.act === 'set_down') return { ...base, id: e.targetId, text: t('ev.set_down', { name: name(e.targetId) }), tier: 'info', icon: 'hand' };
      if (e.act === 'grab') return { ...base, id: e.targetId, text: t('ev.grab', { name: name(e.targetId) }), tier: 'info', icon: 'hand' };
      return null;
    case 'landed':
      if (e.water) return { ...base, id: e.entityId, text: t('ev.splash', { name: name(e.entityId) }), tier: 'info', icon: 'drop' };
      if (e.damage > 0 && w.goblin(e.entityId)) return { ...base, id: e.entityId, text: t('ev.dropped', { name: name(e.entityId), dmg: Math.round(e.damage) }), tier: 'notable', icon: 'skull' };
      return null;
    case 'item_eaten':
      return e.divine ? { ...base, id: e.goblinId, text: t('ev.ate_sky', { name: name(e.goblinId) }), tier: 'info', icon: 'apple' } : null;
    case 'plant_born':
      return e.plantedBy !== null && w.goblin(e.plantedBy) ? { ...base, id: e.plantedBy, text: t('ev.planted', { name: name(e.plantedBy) }), tier: 'info', icon: 'leaf' } : null;
    case 'plant_stage': {
      const p = w.s.plants.find((x) => x.id === e.plantId);
      if (e.stage === 'mature' && p?.plantedBy != null && p.kind === 'apple_bush')
        return { ...base, at: p.pos, text: t('ev.bush_grown', { name: name(p.plantedBy) }), tier: 'notable', icon: 'apple' };
      return null;
    }
    case 'plant_chopped':
      return { ...base, id: e.goblinId, text: t('ev.chopped', { name: name(e.goblinId), n: e.wood }), tier: 'info', icon: 'leaf' };
    case 'rock_mined':
      return e.flint ? { ...base, id: e.goblinId, text: t('ev.flint', { name: name(e.goblinId) }), tier: 'info', icon: 'flint' } : null;
    case 'item_crafted':
      return { ...base, id: e.goblinId, text: t(e.fine ? 'ev.craftedFine' : 'ev.crafted', { name: name(e.goblinId), item: t(`item.${e.item}`) }), tier: e.fine ? 'notable' : 'info', icon: ITEM_ICON[e.item] ?? 'gift' };
    case 'tool_broken':
      return { ...base, id: e.goblinId, text: t('ev.tool_broken', { name: name(e.goblinId), item: t(`item.${e.item}`) }), tier: 'info', icon: ITEM_ICON[e.item] ?? 'gift' };
    case 'enemy_spotted':
      if (w.s.enemies.find((x) => x.id === e.enemyId)?.kind === 'bramblebeast')
        return { ...base, id: e.goblinId, text: t('ev.beast_spotted', { name: name(e.goblinId) }), tier: 'critical', icon: 'fang' };
      return { ...base, id: e.goblinId, text: t('ev.enemy_spotted', { name: name(e.goblinId), enemy: foe(e.enemyId) }), tier: 'notable', icon: 'fang' };
    case 'wisp':
      if (e.goblinId === null) return null;
      if (e.phase === 'lure') return { ...base, id: e.goblinId, text: t('ev.wisp_lure', { name: name(e.goblinId) }), tier: 'notable', icon: 'moon' };
      return { ...base, id: e.goblinId, text: t(e.phase === 'dispersed' ? 'ev.wisp_dispersed' : 'ev.wisp_faded', { name: name(e.goblinId) }), tier: 'info', icon: 'moon' };
    case 'immigrants':
      return { ...base, id: e.goblinIds[0], text: t('ev.immigrants', { names: e.goblinIds.map((id) => name(id)).join(', ') }), tier: 'notable', icon: 'goblin' };
    case 'enemy_stole':
      return { ...base, text: t('ev.enemy_stole', { enemy: foe(e.enemyId), n: e.qty, item: t(`item.${e.item}`) }), tier: 'notable', icon: 'fang' };
    case 'enemy_killed':
      return e.killerId !== null
        ? { ...base, id: e.killerId, text: t('ev.enemy_killed', { name: name(e.killerId), enemy: t(`enemy.${e.kind}`) }), tier: 'notable', icon: 'fang' }
        : { ...base, text: t('ev.enemy_killed_none', { enemy: t(`enemy.${e.kind}`) }), tier: 'notable', icon: 'fang' };
    case 'injured':
      return { ...base, id: e.goblinId, text: t(`ev.injury_${e.injury}`, { name: name(e.goblinId) }), tier: 'info', icon: 'skull' };
    case 'enemy_bit':
      if (!e.damage) return null;
      return { ...base, id: e.goblinId, text: t('ev.enemy_bit', { enemy: foe(e.enemyId), name: name(e.goblinId) }), tier: 'info', icon: 'fang' };
    case 'campfire_out':
      return { ...base, text: t('ev.campfire_out'), tier: 'info', icon: 'heat' };
    case 'building_placed':
      if (e.kind === 'campfire') return { ...base, text: t('ev.campfire_planned'), tier: 'info', icon: 'heat' };
      if (e.kind === 'fence') return w.s.buildings.filter((b) => b.type === 'fence').length <= CFG.fences.perTrip ? { ...base, text: t('ev.fence_started'), tier: 'notable', icon: 'hill' } : null;
      if (e.kind === 'stone_hut') return { ...base, id: e.goblinId, text: t('ev.stone_hut_planned', { name: name(e.goblinId) }), tier: 'info', icon: 'hill' };
      return e.goblinId !== undefined && e.kind === 'hut' ? { ...base, id: e.goblinId, text: t('ev.hut_planned', { name: name(e.goblinId) }), tier: 'info', icon: 'hill' } : null;
    case 'building_completed':
      if (e.kind === 'campfire') return { ...base, text: t('ev.campfire_lit'), tier: 'notable', icon: 'heat' };
      if (e.kind === 'stone_hut') return { ...base, text: t('ev.stone_hut_built'), tier: 'notable', icon: 'hill' };
      if (e.kind === 'fence') return fenceJustClosed(w) ? { ...base, text: t('ev.fence_closed'), tier: 'notable', icon: 'hill' } : null;
      return e.kind === 'hut' ? { ...base, text: t('ev.hut_built'), tier: 'notable', icon: 'hill' } : null;
    case 'building_destroyed':
      if (e.cause === 'bramblebeast')
        return e.kind === 'fence' ? { ...base, text: t('ev.beast_smashed_fence'), tier: 'info', icon: 'fang' }
          : { ...base, text: t('ev.beast_smashed', { building: t(`bld.${e.kind}`) }), tier: 'critical', icon: 'fang' };
      return { ...base, text: t('ev.hut_lost'), tier: 'critical', icon: 'storm' };
    case 'bond_formed': {
      // friendship is news once it is mutual; a grudge is news straight away
      const back = w.goblin(e.bId)?.relationships.find((r) => r.targetId === e.aId)?.bond;
      const pair = { a: name(e.aId), b: name(e.bId) };
      if (e.kind === 'friend' && (back === 'friend' || back === 'best_friend')) return { ...base, id: e.aId, text: t('ev.friends', pair), tier: 'info', icon: 'heart' };
      if (e.kind === 'best_friend' && back === 'best_friend') return { ...base, id: e.aId, text: t('ev.best_friends', pair), tier: 'notable', icon: 'heart' };
      if (e.kind === 'rival' || e.kind === 'enemy') return { ...base, id: e.aId, text: t(`ev.${e.kind}`, pair), tier: e.kind === 'enemy' ? 'notable' : 'info', icon: 'bolt' };
      return null;
    }
    case 'skill_up':
      if (!CFG.skills.notify.includes(e.level)) return null;
      return { ...base, id: e.goblinId, text: t(e.level >= 10 ? 'ev.skill_master' : 'ev.skill_up', { name: name(e.goblinId), skill: t(`skill.${e.skill}`), n: e.level }), tier: e.level >= 10 ? 'notable' : 'info', icon: 'star' };
    case 'gift_given':
      return { ...base, id: e.fromId, text: t('ev.gift_given', { a: name(e.fromId), b: name(e.toId), item: t(`item.${e.item}`) }), tier: 'info', icon: 'gift' };
    case 'comforted':
      return { ...base, id: e.goblinId, text: t('ev.comforted', { a: name(e.byId), b: name(e.goblinId) }), tier: 'info', icon: 'heart' };
    case 'home_claimed':
      return { ...base, id: e.goblinId, text: t('ev.home_claimed', { name: name(e.goblinId) }), tier: 'info', icon: 'heart' };
    case 'freezing':
      return { ...base, id: e.goblinId, text: t('ev.hypothermia', { name: name(e.goblinId) }), tier: 'critical', icon: 'snow' };
    case 'weather_changed':
      return ['storm', 'blizzard', 'heatwave', 'snow'].includes(e.to) && e.from !== e.to
        ? { ...base, text: t(`ev.weather_${e.to}`), tier: 'notable', icon: e.to === 'heatwave' ? 'heat' : e.to === 'storm' ? 'storm' : 'snow' } : null;
    case 'command_rejected':
      return { ...base, text: t('ev.rejected', { reason: t(`reason.${e.reason}`) }), tier: 'info', icon: 'close' };
    default:
      return null;
  }
}
