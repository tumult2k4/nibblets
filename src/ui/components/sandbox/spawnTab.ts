/** Sandbox drawer, "Spawn" tab (§17.5.6): arm anything, then click the ground to place it (repeatable). */
import { el } from '../../dom';
import { t } from '../../i18n';
import { icon, ITEM_ICON } from '../../icons';
import type { Ctx } from '../../ctx';
import type { SpawnSpec } from '../../store';
import { ITEM_DEFS } from '../../../sim/items';
import { CFG } from '../../../sim/config';
import { ENEMY_KINDS } from '../../../sim/sandbox';
import type { BuildingType, ItemType, PlantKind, PlantStage } from '../../../shared/types';

const PLANTS: PlantKind[] = ['apple_bush', 'berry_bush', 'tree', 'flower'];
const STAGES: PlantStage[] = ['seed', 'sprout', 'sapling', 'young', 'mature', 'old', 'dead', 'stump'];
const ENEMY_ICON: Record<string, string> = { gnasher: 'fang', bramblebeast: 'tree', night_wisp: 'moon' };

/** What the armed spec is called, for the label next to the cursor. */
export function spawnName(spec: SpawnSpec): string {
  switch (spec.kind) {
    case 'item': return t(`item.${spec.item}`);
    case 'plant': return `${t(`plant.${spec.plant}`)} (${t(`pstage.${spec.stage}`)})`;
    case 'building': return `${t(`bld.${spec.building}`)}${spec.complete ? '' : ` (${t('insp.blueprint')})`}`;
    case 'enemy': return t(`enemy.${spec.enemy}`);
    case 'egg': return t('sbx.egg');
    case 'goblin': return t('sbx.newGoblin');
  }
}

const same = (a: SpawnSpec | null | undefined, b: SpawnSpec): boolean => !!a && JSON.stringify(a) === JSON.stringify(b);

// the plant and building pickers remember their choice while the drawer is open
const pick = { plant: 'apple_bush' as PlantKind, stage: 'mature' as PlantStage, building: 'hut' as BuildingType, complete: true };

export function spawnTab(ctx: Ctx): HTMLElement {
  const armed = ctx.store.state.spawn;
  const arm = (spec: SpawnSpec) => ctx.store.set({ spawn: same(armed, spec) ? null : spec });
  const chip = (spec: SpawnSpec, ic: string, tip: string) =>
    el(`button.btn.sbx-chip${same(armed, spec) ? '.on' : ''}`, { onclick: () => arm(spec), 'data-tip': tip }, icon(ic));
  const items = (Object.keys(ITEM_DEFS) as ItemType[]).map((k) => chip({ kind: 'item', item: k }, ITEM_ICON[k] ?? 'gift', t(`item.${k}`)));
  const select = <T extends string>(opts: readonly T[], cur: T, label: (v: T) => string, on: (v: T) => void) => {
    const s = el('select', { onchange: () => on(s.value as T) }, ...opts.map((o) => el('option', { value: o, text: label(o) }))) as HTMLSelectElement;
    s.value = cur;
    return s;
  };
  const plantSpec = (): SpawnSpec => ({ kind: 'plant', plant: pick.plant, stage: pick.stage });
  const bldSpec = (): SpawnSpec => ({ kind: 'building', building: pick.building, complete: pick.complete });
  const place = (spec: () => SpawnSpec) => el(`button.btn${same(armed, spec()) ? '.on' : ''}`, { onclick: () => arm(spec()) }, t('sbx.place'));
  const done = el('input', { type: 'checkbox', onchange: () => { pick.complete = done.checked; if (armed?.kind === 'building') ctx.store.set({ spawn: bldSpec() }); } }) as HTMLInputElement;
  done.checked = pick.complete;
  const rearm = (kind: SpawnSpec['kind'], spec: () => SpawnSpec) => { if (armed?.kind === kind) ctx.store.set({ spawn: spec() }); };
  return el('div', {},
    el('h3', { text: t('sbx.items') }), el('div.sbx-grid', {}, ...items),
    el('h3', { text: t('sbx.plants') }),
    el('div.row.sbx-row', {},
      select(PLANTS, pick.plant, (v) => t(`plant.${v}`), (v) => { pick.plant = v; rearm('plant', plantSpec); }),
      select(STAGES, pick.stage, (v) => t(`pstage.${v}`), (v) => { pick.stage = v; rearm('plant', plantSpec); }), place(plantSpec)),
    el('h3', { text: t('sbx.buildings') }),
    el('div.row.sbx-row', {},
      select(Object.keys(CFG.buildings.defs) as BuildingType[], pick.building, (v) => t(`bld.${v}`), (v) => { pick.building = v; rearm('building', bldSpec); }),
      el('label', {}, done, ` ${t('sbx.finished')}`), place(bldSpec)),
    el('h3', { text: t('sbx.creatures') }),
    el('div.sbx-grid', {}, ...ENEMY_KINDS.map((k) => chip({ kind: 'enemy', enemy: k }, ENEMY_ICON[k] ?? 'fang', t(`enemy.${k}`))),
      chip({ kind: 'egg' }, 'egg', t('sbx.egg'))),
    el('p.sub', { text: armed ? `${t('sbx.place')} ${spawnName(armed)} · ${t('sbx.placeHint')}` : t('sbx.spawnHint') }));
}
