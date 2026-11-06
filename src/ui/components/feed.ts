import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import type { Note } from '../notify';
import { clockAt } from '../../sim/time';
import { audio } from '../audio';

/** Bottom-left Feed tab (last 200 notifications, filter chips) + toasts (§18.9). */
export class Feed implements Component {
  private root = el('div.bottomleft.panel');
  private list = el('div.feed');
  private chips = el('div.tabs');
  private toasts = el('div.toasts');
  private notes: Note[] = [];
  private filter: 'all' | 'critical' = 'all';
  private dirty = true;
  private recent = new Map<string, { el: HTMLElement; n: number; at: number }>();

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    this.root.append(el('div.row', {}, el('b', { text: t('feed.tab') }), this.chips), this.list);
    parent.append(this.root, this.toasts);
    this.renderChips();
  }

  private renderChips(): void {
    this.chips.replaceChildren(...(['all', 'critical'] as const).map((f) =>
      el(`button.btn${f === this.filter ? '.on' : ''}`, { onclick: () => { this.filter = f; this.dirty = true; this.renderChips(); this.update(); } }, t(`feed.${f}`))));
  }

  add(n: Note): void {
    this.notes.push(n);
    if (this.notes.length > 200) this.notes.shift();
    this.dirty = true;
    if (n.tier !== 'info') this.toast(n);
  }

  /** Toast with merge of duplicates within 10 s ("3× …"). */
  toast(n: Pick<Note, 'text' | 'tier' | 'at' | 'id' | 'icon'>): void {
    audio.play(n.tier === 'critical' ? 'toast_critical' : 'toast_notable');
    const now = performance.now();
    const dup = this.recent.get(n.text);
    if (dup && now - dup.at < 10000) {
      dup.n += 1;
      dup.at = now;
      dup.el.querySelector('.txt')!.textContent = `${dup.n}× ${n.text}`;
      return;
    }
    const jump = n.at ? el('button.btn', { onclick: () => this.jump(n), 'data-tip': t('feed.jump') }, icon('eye')) : null;
    const tEl = el(`div.toast.panel.${n.tier}`, {}, icon(n.icon), el('span.txt', { text: n.text }), jump,
      el('button.btn', { onclick: () => tEl.remove(), 'data-tip': t('insp.close') }, icon('close')));
    this.toasts.prepend(tEl);
    this.recent.set(n.text, { el: tEl, n: 1, at: now });
    while (this.toasts.children.length > 5) this.toasts.lastElementChild!.remove();
    if (n.tier !== 'critical') window.setTimeout(() => tEl.remove(), n.tier === 'notable' ? 8000 : 4000);
  }

  private jump(n: Pick<Note, 'at' | 'id'>): void {
    if (n.at) this.ctx.flyTo(n.at);
    if (n.id !== undefined && this.ctx.game.world.goblin(n.id)) this.ctx.select('goblin', [n.id]);
  }

  update(): void {
    const open = this.ctx.store.state.openPanels.feed;
    this.root.classList.toggle('hidden', !open);
    if (!open || !this.dirty) return;
    this.dirty = false;
    const shown = this.notes.filter((n) => (this.filter === 'all' ? true : n.tier === 'critical')).slice(-80).reverse();
    this.list.replaceChildren(...(shown.length ? shown.map((n) => {
      const c = clockAt(n.tick);
      return el('div.item', { onclick: () => this.jump(n) }, el('span.t', { text: `${c.seasonDay + 1}·${String(Math.floor(c.hour)).padStart(2, '0')}h` }), icon(n.icon), el('span', { text: n.text }));
    }) : [el('div.sub', { text: t('feed.empty') })]));
  }

  refreshLanguage(): void {
    this.root.firstElementChild!.firstElementChild!.textContent = t('feed.tab');
    this.renderChips();
    this.dirty = true;
  }

  reset(): void {
    this.notes = [];
    this.dirty = true;
  }
}
