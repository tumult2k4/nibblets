import { el } from '../../dom';
import { t } from '../../i18n';
import { icon } from '../../icons';
import type { Building } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { buildingDef, missingMaterials } from '../../../sim/buildings';
import { bar } from './goblinInspector';

const row = (label: string, ...rest: (HTMLElement | string)[]) => el('div.row', {}, el('span.lbl', { text: label }), ...rest);

/** Building inspector (§18.6): progress, condition, owner, residents, storage. */
export function buildingHead(b: Building, onClose: () => void): HTMLElement {
  return el('div.insp-head', {}, icon('hill', 'portrait'),
    el('div', {}, el('h2', { text: t(`bld.${b.type}`) }),
      el('div.sub', { text: `${t('insp.building')} · ${b.buildProgress >= 1 ? t('insp.done') : t('insp.blueprint')}` }),
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
    b.buildProgress >= 1 && def?.storage ? row(t('insp.storage'), el('span', { text: `${stored} (${b.storage.reduce((n, s) => n + s.qty, 0)}/${def.storage})` })) : null,
  );
}
