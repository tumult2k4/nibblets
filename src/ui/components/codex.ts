import { el } from '../dom';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { beliefsPage, creaturesPage, deedsPage, geneticsPage, placesPage, recipesPage } from './codexPages';

const TABS = ['recipes', 'creatures', 'beliefs', 'places', 'genetics', 'deeds'] as const;
type Tab = (typeof TABS)[number];

/**
 * The Codex (X, §18.7, P11.1): Recipes (known, lost, undiscovered), Creatures met, Beliefs, Places, Genetics and the
 * divine deeds, one tab at a time. A page is rebuilt when it is opened and at most once a game hour while open (the
 * genetics page draws a canvas), or at once when the player switches tabs.
 */
export class Codex implements Component {
  private root = el('div.codex.panel.hidden');
  private tabs = el('div.cx-tabs');
  private body = el('div.cx-body');
  private tab: Tab = 'recipes';
  private key = '';

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const close = el('button.btn.iconbtn', { onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, codex: false } }) }, '✕');
    this.root.append(el('div.vp-head', {}, el('h2', { text: t('codex.title') }), close), this.tabs, this.body);
    parent.append(this.root);
    this.renderTabs();
  }

  private renderTabs(): void {
    this.tabs.replaceChildren(...TABS.map((k) => el(`button.btn${k === this.tab ? '.on' : ''}`, {
      text: t(`codex.${k}`), onclick: () => { this.tab = k; this.key = ''; this.renderTabs(); this.update(); },
    })));
  }

  update(): void {
    const open = !!this.ctx.store.state.openPanels.codex;
    this.root.classList.toggle('hidden', !open);
    if (!open) { this.key = ''; return; }
    const s = this.ctx.game.world.s, key = `${this.tab}:${Math.floor(s.tick / 150)}:${s.goblins.length}`;
    if (key === this.key) return;
    this.key = key;
    const page = this.tab === 'recipes' ? recipesPage(s) : this.tab === 'creatures' ? creaturesPage(s.history?.seen ?? [])
      : this.tab === 'beliefs' ? beliefsPage(s) : this.tab === 'places' ? placesPage(s, (p) => this.ctx.flyTo(p))
      : this.tab === 'genetics' ? geneticsPage(s) : deedsPage();
    this.body.replaceChildren(page);
  }
}
