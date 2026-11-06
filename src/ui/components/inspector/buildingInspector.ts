import { el } from '../../dom';
import { t } from '../../i18n';
import { consecrated } from '../../../sim/shrine';
import { icon } from '../../icons';
import type { Building } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { buildingDef, missingMaterials } from '../../../sim/buildings';
import { bar } from './goblinInspector';
import { CFG } from '../../../sim/config';
import { dryProgress, isDrying, rackDried, rackLoad } from '../../../sim/preserve';
import { towerOf } from '../../../sim/watch';
import { journalsOf } from '../../../llm/store';
import { booksOn } from '../../../sim/books';
import { knowName } from '../../notify';

const row = (label: string, ...rest: (HTMLElement | string)[]) => el('div.row', {}, el('span.lbl', { text: label }), ...rest);

/** Building inspector (§18.6): progress, condition, owner, residents, storage, fuel. */
export function buildingHead(b: Building, onClose: () => void): HTMLElement {
  return el('div.insp-head', {}, icon('hill', 'portrait'),
    el('div', {}, el('h2', { text: t(`bld.${b.type}`) }),
      el('div.sub', { text: `${t('insp.building')} · ${b.buildProgress >= 1 ? t('insp.done') : t('insp.blueprint')}${b.data?.repair ? ` · ${t('insp.repair')}` : ''}` }),
      el('button.btn', { onclick: onClose }, icon('close'))));
}

export function buildingBody(b: Building, w: World, onDiary?: (id: number) => void): HTMLElement {
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
    b.decoration.length ? row(t(b.type === 'shrine' || b.type === 'temple' ? 'insp.offerings' : 'insp.shelf'), el('span', { text: b.decoration.map((id) => w.s.trinkets.find((x) => x.id === id)).map((x) => (x ? t(`trinket.${x.kind}`) : '?'))
      .concat((w.s.god.faith?.offerings ?? []).filter((o) => o.buildingId === b.id && o.item).map((o) => t(`item.${o.item}`))).join(' · ') })) : null,
    consecrated(b) ? el('div.sub', { text: t('insp.consecrated') }) : null, // P8.8
    onDiary ? diaryShelf(b, w, onDiary) : null,
    b.type === 'library_shelf' ? bookShelf(b, w) : null,
    b.type === 'watchtower' && b.buildProgress >= 1
      ? row(t('insp.lookout'), el('span', { text: w.s.goblins.find((g) => towerOf(g, w)?.id === b.id)?.name ?? t('insp.nobody') })) : null,
  );
}

/** A library shelf's books (P9.5): the title its writer gave it (when the words have come), who wrote it, what it teaches. */
function bookShelf(b: Building, w: World): HTMLElement {
  const books = booksOn(w.s, b.id), pages = journalsOf(w.s, null, 'book');
  return el('div', {}, el('h3', { text: `${t('insp.books')} (${books.length}/${CFG.books.perShelf})` }),
    ...books.map((bk) => {
      const title = pages.find((j) => j.ref === bk.id)?.title;
      return el('div.row', {}, el('span.lbl', { text: `${title ? `${title} · ` : ''}${t('insp.bookBy', { name: bk.author })}` }), el('span', { text: bk.contents.map(knowName).join(', ') }));
    }));
}

/** A hut's shelf of its residents' diaries (§19.7, P9.4): one button each, opening the journal. */
function diaryShelf(b: Building, w: World, open: (id: number) => void): HTMLElement | null {
  const books = b.occupants.map((id) => ({ id, n: journalsOf(w.s, id, 'diary').length })).filter((x) => x.n > 0);
  if (!books.length) return null;
  return row(t('journal.shelf'), el('span', {}, ...books.map((x) => el('button.btn', { onclick: () => open(x.id), style: 'margin:0 4px 4px 0' }, icon('book'), ` ${w.goblin(x.id)?.name ?? '?'} (${x.n})`))));
}
