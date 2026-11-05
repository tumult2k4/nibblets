import { el } from '../dom';
import { icon, ITEM_ICON } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { GIFT_TRAY, SAPLING_VALUE, itemDef, saplingKind, type TrayEntry } from '../../sim/items';

export type TrayDragStart = (item: TrayEntry, e: PointerEvent) => void;

/** Bottom-center Gift Tray (§18.5): Food and Materials tabs; drag a slot into the world. */
export class GiftTray implements Component {
  private root = el('div.tray.panel.hidden');
  private tabs = el('div.tabs');
  private slots = el('div.slots');
  private hint = el('div.sub', { style: 'font-size:.8em;margin-top:4px' });
  private renderedTab = '';
  qty = 1;

  constructor(private ctx: Ctx, private onDrag: TrayDragStart) {}

  mount(parent: HTMLElement): void {
    this.root.append(this.tabs, this.slots, this.hint);
    parent.append(this.root);
  }

  private render(): void {
    const st = this.ctx.store.state;
    this.renderedTab = st.trayTab + st.settings.language;
    this.tabs.replaceChildren(...(['food', 'materials', 'life'] as const).map((tab) =>
      el(`button.btn${tab === st.trayTab ? '.on' : ''}`, { onclick: () => this.ctx.store.set({ trayTab: tab }) }, t(`tray.${tab}`))));
    this.slots.replaceChildren(...GIFT_TRAY[st.trayTab].map((item, i) => {
      const kind = saplingKind(item);
      const label = kind ? t(`tray.sapling.${kind}`) : t(`item.${item}`);
      const ic = kind ? 'leaf' : ITEM_ICON[item as keyof typeof ITEM_ICON] ?? 'gift';
      const cost = kind ? SAPLING_VALUE : itemDef(item as Exclude<TrayEntry, `sapling:${string}`>).value;
      const s = el('div.slot', {}, el('span.k', { text: String(i + 1) }), icon(ic), el('span', { text: label }));
      s.dataset.tip = `${label} · ${this.ctx.game.world.s.god.mode === 'sandbox' ? t('power.free') : t('power.cost', { n: cost })}`;
      s.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onDrag(item, e);
      });
      return s;
    }));
    this.hint.textContent = t('tray.hint', { n: this.qty });
  }

  update(): void {
    const st = this.ctx.store.state;
    const show = st.openPanels.tray && !this.ctx.readOnly();
    this.root.classList.toggle('hidden', !show);
    if (show && this.renderedTab !== st.trayTab + st.settings.language) this.render();
    this.hint.textContent = t('tray.hint', { n: this.qty });
  }

  /** Number keys pick tray slots only while the tray is open & hovered/focused (§18.11 note). */
  itemAt(i: number): TrayEntry | undefined {
    return GIFT_TRAY[this.ctx.store.state.trayTab][i];
  }
  isHovered(): boolean {
    return this.root.matches(':hover');
  }
}
