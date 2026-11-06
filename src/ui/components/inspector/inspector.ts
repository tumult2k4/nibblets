import { el, setText } from '../../dom';
import { godTitle, t } from '../../i18n';
import type { Ctx, Component } from '../../ctx';
import { bar, bodyTab, goblinHeader, inventoryTab, mindTab, statusTab } from './goblinInspector';
import { CFG } from '../../../sim/config';
import { tileAt } from '../../../sim/grid';
import { icon, ITEM_ICON } from '../../icons';
import { keyLabel } from '../../keys';
import { tipKey } from '../tooltip';
import { buildingBody, buildingHead } from './buildingInspector';
import { socialTab } from './socialTab';
import { eggBody, eggHead } from './eggInspector';
import { graveBody, graveHead } from './graveInspector';
import { visitorBody, visitorHead } from './visitorInspector';
import { visitorById } from '../../../sim/visitors';
import { chiefOf } from '../../../sim/leadership';
import { festivalNow } from '../../../sim/festivals';
import { villageTitle } from '../../../llm/store';

type Tab = 'status' | 'mind' | 'social' | 'body' | 'inventory';
const TABS: Tab[] = ['status', 'mind', 'social', 'body', 'inventory'];

/** Right context panel (§18.6): inspector for the selection, else "Village at a glance". */
export class Inspector implements Component {
  private root = el('div.inspector.panel');
  private head = el('div');
  private tabs = el('div.tabs');
  private body = el('div');
  private sig = '';
  private lastBody = 0;
  /** whose grave is open (to follow it out if the god raises it, P6.6) */
  private graveOf: number | null = null;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    this.root.append(this.head, this.tabs, this.body);
    parent.append(this.root);
  }

  update(): void {
    const st = this.ctx.store.state;
    this.root.classList.toggle('hidden', !st.openPanels.inspector);
    if (!st.openPanels.inspector) return;
    const w = this.ctx.game.world;
    const id = st.selection[0];
    const sig = `${st.selectedKind}:${id}:${st.inspectorTab}:${st.settings.language}:${id !== undefined && st.selectedKind === 'goblin' ? w.goblin(id)?.lifeStage : ''}`;
    const fresh = sig !== this.sig;
    this.sig = sig;
    const now = performance.now();
    if (!fresh && now - this.lastBody < 250) return; // body refresh at ~4 Hz is plenty
    this.lastBody = now;
    if (st.selectedKind === 'goblin' && id !== undefined) {
      const g = w.goblin(id);
      if (!g) return this.ctx.select(null, []);
      if (fresh) {
        const family = () => this.ctx.store.set({ familyFocus: g.id, openPanels: { ...this.ctx.store.state.openPanels, family: true } });
        const journal = () => this.openJournal(g.id);
        this.head.replaceChildren(goblinHeader(g, w, () => this.ctx.follow(g.id), () => this.ctx.select(null, []), family, journal));
        this.tabs.replaceChildren(...TABS.map((tab) => el(`button.btn${tab === st.inspectorTab ? '.on' : ''}`, { onclick: () => this.ctx.store.set({ inspectorTab: tab }) }, t(`insp.${tab}`))));
        if (st.selection.length > 1) this.tabs.prepend(el('span.badge', { text: `+${st.selection.length - 1}` }));
      }
      const tab = st.inspectorTab;
      const pick = (o: number) => this.ctx.select('goblin', [o]);
      this.body.replaceChildren(tab === 'status' ? statusTab(g, w) : tab === 'mind' ? mindTab(g, w) : tab === 'social' ? socialTab(g, w, pick) : tab === 'body' ? bodyTab(g, w) : inventoryTab(g, w));
      return;
    }
    this.tabs.replaceChildren();
    if (st.selectedKind === 'plant' && id !== undefined) {
      const p = w.s.plants.find((x) => x.id === id);
      if (!p) return this.ctx.select(null, []);
      const tile = tileAt(w.s, Math.floor(p.pos.x), Math.floor(p.pos.y));
      const perHour = CFG.plants.seasonMul[w.clock.season] / (CFG.plants.appleRegrowDays * 24);
      const eta = p.kind === 'apple_bush' && p.fruit < CFG.plants.maxApples && perHour > 0 ? `${((1 - p.fruitProgress) / perHour).toFixed(1)} h` : '—';
      this.head.replaceChildren(el('div.insp-head', {}, icon(p.kind === 'apple_bush' ? 'apple' : 'leaf', 'portrait'),
        el('div', {}, el('h2', { text: t('insp.plant') }), el('div.sub', { text: p.kind.replace('_', ' ') }),
          el('button.btn', { onclick: () => this.ctx.select(null, []) }, icon('close')))));
      this.body.replaceChildren(
        el('div.row', {}, el('span.lbl', { text: t('insp.stage') }), el('span', { text: t(`pstage.${p.stage}`) })),
        el('div.row', {}, el('span.lbl', { text: t('insp.fruit') }), el('span', { text: `${p.fruit} / ${CFG.plants.maxApples}` })),
        el('div.row', {}, el('span.lbl', { text: t('insp.nextFruit') }), bar(p.fruitProgress * 100, 'var(--apple)'), el('span.val', { text: eta })),
        el('div.row', {}, el('span.lbl', { text: t('insp.hydration') }), bar(p.hydration * 100, 'var(--sky)')),
        ...(p.blight > 0 ? [el('div.row', {}, el('span.lbl', { text: t('insp.blight') }), bar(p.blight * 100, 'var(--bark-2)'))] : []),
        el('div.row', {}, el('span.lbl', { text: t('insp.fertility') }), bar((tile?.fertility ?? 0) * 100, 'var(--bark-2)')),
        el('div.row', {}, el('span.lbl', { text: t('insp.plantedBy') }), el('span', { text: p.plantedBy !== null ? (w.goblin(p.plantedBy)?.name ?? '?') : t('insp.wild') })),
      );
      return;
    }
    if (st.selectedKind === 'egg' && id !== undefined) {
      const egg = w.s.eggs.find((x) => x.id === id);
      if (!egg) return this.ctx.select(null, []); // hatched (or lost)
      if (fresh) this.head.replaceChildren(eggHead(egg, () => this.ctx.select(null, [])));
      this.body.replaceChildren(eggBody(egg, w, (o) => this.ctx.select('goblin', [o])));
      return;
    }
    if (st.selectedKind === 'grave' && id !== undefined) {
      const gr = w.s.graves.find((x) => x.id === id);
      // raised from it (P6.6): follow the goblin out of the empty grave
      if (!gr) return this.graveOf !== null && w.goblin(this.graveOf) ? this.ctx.select('goblin', [this.graveOf]) : this.ctx.select(null, []);
      this.graveOf = gr.goblinId;
      if (fresh) this.head.replaceChildren(graveHead(gr, () => this.ctx.select(null, [])));
      const cast = this.ctx.readOnly() ? null : () => this.ctx.push({ type: 'god_cast', power: 'resurrect', pos: { ...gr.pos }, targetId: gr.id });
      this.body.replaceChildren(graveBody(gr, w, (o) => this.ctx.select('goblin', [o]), cast));
      return;
    }
    if (st.selectedKind === 'visitor' && id !== undefined) { // P10.2
      const v = visitorById(w.s, id);
      if (!v) return this.ctx.select(null, []); // gone home
      if (fresh) this.head.replaceChildren(visitorHead(v, w, () => this.ctx.follow(v.id), () => this.ctx.select(null, [])));
      this.body.replaceChildren(...visitorBody(v));
      return;
    }
    if (st.selectedKind === 'building' && id !== undefined) {
      const b = w.s.buildings.find((x) => x.id === id);
      if (!b) return this.ctx.select(null, []);
      if (fresh) this.head.replaceChildren(buildingHead(b, () => this.ctx.select(null, [])));
      this.body.replaceChildren(buildingBody(b, w, (gid) => this.openJournal(gid)));
      return;
    }
    if (st.selectedKind === 'item' && id !== undefined) {
      const it = w.s.groundItems.find((x) => x.id === id);
      if (!it) return this.ctx.select(null, []);
      this.head.replaceChildren(el('div.insp-head', {}, icon(ITEM_ICON[it.stack.type] ?? 'gift', 'portrait'),
        el('div', {}, el('h2', { text: t(`item.${it.stack.type}`) }), el('div.sub', { text: `${t('insp.item')} · ${t('insp.qty')} ${it.stack.qty}${it.stack.divine ? ` · ${t('insp.sky')}` : ''}` }),
          el('button.btn', { onclick: () => this.ctx.select(null, []) }, icon('close')))));
      this.body.replaceChildren();
      return;
    }
    this.glance();
  }

  /** Village at a glance (no selection). */
  private openJournal(id: number): void {
    this.ctx.store.set({ journalFocus: id, journalTab: 'diary', openPanels: { ...this.ctx.store.state.openPanels, journal: true } });
  }

  private glance(): void {
    const w = this.ctx.game.world;
    const s = w.s;
    const gs = s.goblins;
    const avg = (k: 'hunger' | 'thirst' | 'energy' | 'curiosity') => (gs.length ? gs.reduce((a, g) => a + g.needs[k], 0) / gs.length : 100);
    const needs = (['hunger', 'thirst', 'energy', 'curiosity'] as const).map((k) => ({ k, v: avg(k) })).sort((a, b) => a.v - b.v).slice(0, 3);
    this.head.replaceChildren(el('h2', { text: t('insp.glance') }), el('div.sub', { text: villageTitle(s) }));
    const godLine = el('div.row');
    setText(godLine, t('insp.glanceGod', { name: s.god.godName ? godTitle(s) : t('insp.glanceUnnamed') }));
    const chief = chiefOf(w);
    const fest = festivalNow(w); // P8.5
    this.body.replaceChildren(godLine, el('div.row', { text: chief ? t('village.chief', { name: chief.name }) : t('village.noChief') }),
      ...(fest ? [el('div.row', { text: t('village.festivalNow', { fest: t(`fest.${fest.kind}`) }) })] : []), el('h3', { text: t('insp.glanceNeeds') }),
      ...needs.map((n) => el('div.row', {}, el('span.lbl', { text: t(`need.${n.k}`) }), bar(n.v), el('span.val', { text: String(Math.round(n.v)) }))),
      el('div.row', {}, el('span.lbl', { text: t('top.housed', { n: gs.filter((g) => g.homeId !== null && s.buildings.some((b) => b.id === g.homeId && b.buildProgress >= 1)).length, m: gs.length }) })),
      el('h3', { text: t('insp.stockpile') }),
      el('div.sub', { text: s.village.stockpile.length ? s.village.stockpile.map((x) => `${t(`item.${x.type}`)} ${x.qty}`).join(' · ') : t('insp.stockEmpty') }),
      el('p.sub', {}, t('insp.noSelection')),
      el('p.sub', { 'data-tip': tipKey(t('key.inspector'), keyLabel('inspector')) }, `${t('key.inspector')}: `, el('kbd', { text: keyLabel('inspector') })));
  }
}
