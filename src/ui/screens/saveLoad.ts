import { el } from '../dom';
import { t } from '../i18n';
import { overlay } from './common';
import { AUTO_SLOTS, MANUAL_SLOTS, QUICK_SLOT, listSlots, type SlotMeta } from '../saves';

export interface SaveActions {
  canSave: boolean;
  save: (slot: string) => Promise<void>;
  load: (slot: string) => Promise<void>;
  replay: (slot: string) => Promise<void>;
  del: (slot: string) => Promise<void>;
  exportSlot: (slot: string) => Promise<void>;
  importFile: () => Promise<void>;
  close: () => void;
}

/** Save/Load (§18.3): 3 autosave + 10 manual slots with thumbnails, export/import, watch replay. */
export function saveLoadScreen(a: SaveActions): HTMLElement {
  const grid = el('div.slots-grid');
  const { root } = overlay(el('h1', { text: t('save.title') }), grid,
    el('div', { style: 'display:flex;gap:8px;margin-top:12px' }, el('button.btn', { onclick: () => a.importFile().then(refresh) }, t('save.import')), el('button.btn', { onclick: a.close }, t('menu.close'))));
  const card = (slot: string, label: string, m: SlotMeta | undefined) => {
    const busy = (fn: () => Promise<void>) => () => fn().then(refresh);
    return el('div.saveslot', {},
      m?.thumb ? el('img', { src: m.thumb }) : el('div', { style: 'height:96px;border-radius:6px;background:#8a9a7a;display:flex;align-items:center;justify-content:center', text: t('save.empty') }),
      el('b', { text: `${label}${m ? ` · ${m.village}` : ''}` }),
      m ? el('div.sub', { text: t('save.info', { day: m.day, year: m.year, pop: m.pop, mode: m.mode }) }) : null,
      m ? el('div.sub', { text: new Date(m.savedAt).toLocaleString() }) : null,
      el('div.acts', {},
        a.canSave && !slot.startsWith('auto') && slot !== QUICK_SLOT ? el('button.btn', { onclick: busy(() => a.save(slot)) }, t('save.saveHere')) : null,
        m ? el('button.btn', { onclick: () => a.load(slot) }, t('save.load')) : null,
        m ? el('button.btn', { onclick: () => a.replay(slot) }, t('save.replay')) : null,
        m ? el('button.btn', { onclick: () => a.exportSlot(slot) }, t('save.export')) : null,
        m ? el('button.btn.danger', { onclick: busy(() => a.del(slot)) }, t('save.delete')) : null));
  };
  const refresh = async () => {
    const metas = await listSlots().catch(() => [] as SlotMeta[]);
    const by = new Map(metas.map((m) => [m.slot, m]));
    grid.replaceChildren(
      card(QUICK_SLOT, t('save.quickSlot'), by.get(QUICK_SLOT)),
      ...AUTO_SLOTS.map((s, i) => card(s, t('save.auto', { n: i + 1 }), by.get(s))),
      ...MANUAL_SLOTS.map((s, i) => card(s, t('save.slot', { n: i + 1 }), by.get(s))),
    );
  };
  void refresh();
  return root;
}
