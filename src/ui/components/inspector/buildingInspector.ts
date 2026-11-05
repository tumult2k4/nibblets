import { el } from '../../dom';
import { t } from '../../i18n';
import { icon } from '../../icons';
import type { Building } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { buildingDef, missingMaterials } from '../../../sim/buildings';
import { bar } from './goblinInspector';
import { CFG } from '../../../sim/config';
import { dryProgress, isDrying, rackDried, rackLoad } from '../../../sim/preserve';
import { towerOf } from '../../../sim/watch';

const row = (label: string, ...rest: (HTMLElement | string)[]) => el('div.row', {}, el('span.lbl', { text: label }), ...rest);

/** Building inspector (§18.6): progress, condition, owner, residents, storage, fuel. */
export function buildingHead(b: Building, onClose: () => void): HTMLElement {
  return el('div.insp-head', {}, icon('hill', 'portrait'),
    el('div', {}, el('h2', { text: t(`bld.${b.type}`) }),
      el('div.sub', { text: `${t('insp.building')} · ${b.buildProgress >= 1 ? t('insp.done') : t('insp.blueprint')}${b.data?.repair ? ` · ${t('insp.repair')}` : ''}` }),
      el('button.btn', { onclick: onClose }, icon('close'))));
}

export function buildingBody(b: Building, w: World): HTMLElement {
  const name = (id: number | null) => (id === null ? t('insp.nobody') : w.goblin(id)?.name ?? '?');
  const def = buildingDef(b.type);
  const missing = missingMaterials(b);
  const stored = b.storage.length ? b.storage.map((s) => `${t(`item.${s.type}`)} ${s.qty}`).join(' · ') : t('insp.storeEmpty');
  return el('div', {},
    b.buildProgress < 1 ? row(t('insp.progress'), bar(b.buildProgress * 100, 'var(--gold)'), el('span.val', { text: `${Math.round(b.buildProgress * 100)}%` })) : null,
    missing.length ? row(t('insp.needsMat'), el('span', { text: missing.map((m) => `${t(`item.${m.type}`)} ${m.qty}`).join(' · ') })) : null,
    row(t('insp.hpLbl'), bar((b.hp / b.maxHp) * 100), el('span.val', { text: `${Math.round(b.hp)}/${b.maxHp}` })),
    row(t('insp.owner'), el('span', { text: name(b.ownerId) })),
    def?.capacity ? row(t('insp.residents'), el('span', { text: `${b.occupants.map((id) => name(id)).join(', ') || t('insp.nobody')} (${b.occupants.length}/${def.capacity})` })) : null,
    b.type === 'campfire' && b.buildProgress >= 1
      ? row(t('insp.fuel'), bar(((b.fuel ?? 0) / CFG.fire.maxFuel) * 100, 'var(--gold)'), el('span.val', { text: (b.fuel ?? 0) > 0 ? t('insp.fuelHours', { n: Math.round((b.fuel ?? 0) / CFG.god.hourTicks) }) : t('insp.fireOut') }))
      : null,
    b.buildProgress >= 1 && def?.storage && b.type !== 'storage_pit' ? row(t('insp.storage'), el('span', { text: `${stored} (${b.storage.reduce((n, s) => n + s.qty, 0)}/${def.storage})` })) : null,
    b.type === 'drying_rack' && isDrying(b) ? row(t('insp.rack', { n: rackLoad(b) }), bar(dryProgress(b) * 100, 'var(--gold)'), el('span.val', { text: `${Math.round(dryProgress(b) * 100)}%` })) : null,
    b.type === 'drying_rack' && rackDried(b) > 0 ? el('div.sub', { text: t('insp.rackDone', { n: rackDried(b) }) }) : null,
    b.type === 'watchtower' && b.buildProgress >= 1
      ? row(t('insp.lookout'), el('span', { text: w.s.goblins.find((g) => towerOf(g, w)?.id === b.id)?.name ?? t('insp.nobody') })) : null,
  );
}
