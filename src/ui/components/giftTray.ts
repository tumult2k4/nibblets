import { el } from '../dom';
import { icon, ITEM_ICON } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { GIFT_TRAY, SAPLING_VALUE, TOOLS_TIER, TRAY_TABS, itemDef, saplingKind, type TrayEntry } from '../../sim/items';
import { giftTier } from '../../sim/god/tiers';
import { CFG } from '../../sim/config';

export type TrayDragStart = (item: TrayEntry, e: PointerEvent) => void;

/** Bottom-center Gift Tray (§18.5): Food, Materials, Tools (Divine: tier 2+) and Life tabs; drag a slot into the world. */
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

  private sig(): string {
    const st = this.ctx.store.state;
    const g = this.ctx.game.world.s.god;
    return st.trayTab + st.settings.language + (this.toolsLocked() ? 'L' : '') + (g.mode === 'divine' ? g.tier : '');
  }
  private toolsLocked(): boolean {
    const g = this.ctx.game.world.s.god;
    return g.mode === 'divine' && g.tier < TOOLS_TIER;
  }

  private render(): void {
    const st = this.ctx.store.state;
    if (st.trayTab === 'tools' && this.toolsLocked()) st.trayTab = 'food';
    this.renderedTab = this.sig();
    this.tabs.replaceChildren(...TRAY_TABS.filter((tab) => tab !== 'tools' || !this.toolsLocked()).map((tab) =>
      el(`button.btn${tab === st.trayTab ? '.on' : ''}`, { onclick: () => this.ctx.store.set({ trayTab: tab }) }, t(`tray.${tab}`))));
    this.slots.replaceChildren(...GIFT_TRAY[st.trayTab].map((item, i) => {
      const kind = saplingKind(item);
      const label = kind ? t(`tray.sapling.${kind}`) : t(`item.${item}`);
      const ic = kind ? 'leaf' : ITEM_ICON[item as keyof typeof ITEM_ICON] ?? 'gift';
      const cost = kind ? SAPLING_VALUE : itemDef(item as Exclude<TrayEntry, `sapling:${string}`>).value;
      const god = this.ctx.game.world.s.god;
      const need = kind ? CFG.divine.giftTier : giftTier(item as Exclude<TrayEntry, `sapling:${string}`>); // P8.9: Divine-mode tiers
      const locked = god.mode === 'divine' && god.tier < need;
      const s = el(`div.slot${locked ? '.locked' : ''}`, {}, el('span.k', { text: String(i + 1) }), icon(ic), el('span', { text: label }));
      s.dataset.tip = `${label} · ${god.mode === 'sandbox' ? t('power.free') : locked ? t('power.tier', { n: need }) : t('power.cost', { n: cost })}`;
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
    if (show && this.renderedTab !== this.sig()) this.render();
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
