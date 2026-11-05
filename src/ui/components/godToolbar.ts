import { el } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { tipKey } from './tooltip';
import { keyLabel } from '../keys';
import { POWER_DEFS } from '../../sim/god/powerDefs';
import type { ToolId } from '../store';
import { FOREST_KINDS, TERRAFORM_POWERS, type TerraformPower } from '../../sim/god/terraform';
import { cardsSig, powerCards } from './powerCards';

const POWER_ICON: Record<TerraformPower, string> = {
  raise_land: 'hill', lower_land: 'valley', smooth: 'smooth', create_water: 'drop', fertile_soil: 'sparkle', plant_forest: 'tree', place_rock: 'stone',
};

/** Left god toolbar (§18.2). Only categories with implemented powers are shown. */
export class GodToolbar implements Component {
  private root = el('div.toolbar.panel');
  private flyout = el('div.flyout.panel.hidden');
  private btns = new Map<ToolId, HTMLButtonElement>();
  private flySig = '';
  private radiusLabel: HTMLElement | null = null;
  private radiusInput: HTMLInputElement | null = null;
  private castLabel: HTMLElement | null = null;
  private castInput: HTMLInputElement | null = null;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const tools: [ToolId, string, string, string][] = [
      ['hand', 'hand', t('tool.handTip'), 'hand'],
      ['gifts', 'gift', t('tool.giftsTip'), 'gifts'],
      ['nature', 'cloud', t('tool.natureTip'), 'nature'],
      ['terraform', 'hill', t('tool.terraformTip'), 'terraform'],
      ['wrath', 'bolt', t('tool.wrathTip'), 'wrath'],
    ];
    for (const [id, ic, tip, key] of tools) {
      const b = el('button.btn.iconbtn', { onclick: () => this.choose(id) }, icon(ic));
      b.dataset.tip = tipKey(tip, keyLabel(key));
      this.btns.set(id, b);
      this.root.append(b);
    }
    const help = el('button.btn.iconbtn', { onclick: () => this.ctx.openOverlay('help') }, icon('help'));
    help.dataset.tip = tipKey(t('menu.help'), keyLabel('help'));
    this.root.append(el('div', { style: 'height:8px' }), help);
    parent.append(this.root, this.flyout);
  }

  choose(id: ToolId): void {
    const st = this.ctx.store.state;
    if (id === 'wrath' && this.ctx.game.world.s.god.gentle) id = 'hand';
    if (id === 'terraform' || id === 'nature' || id === 'wrath') {
      const open = st.activeTool !== id;
      this.ctx.store.set({ activeTool: open ? id : 'hand', armed: null, openPanels: { ...st.openPanels, tray: false, flyout: open } });
      this.flyout.replaceChildren();
    } else if (id === 'gifts') {
      const open = !(st.activeTool === 'gifts' && st.openPanels.tray);
      this.ctx.store.set({ activeTool: open ? 'gifts' : 'hand', armed: null, openPanels: { ...st.openPanels, tray: open, flyout: open } });
    } else this.ctx.store.set({ activeTool: 'hand', armed: null, openPanels: { ...st.openPanels, tray: false, flyout: false } });
  }

  /** Terraform flyout: power cards, brush size, plant kind / rock size options. */
  private renderTerraform(): void {
    const st = this.ctx.store.state;
    const free = this.ctx.game.world.s.god.mode === 'sandbox';
    const cards = TERRAFORM_POWERS.map((id) => {
      const def = POWER_DEFS.find((p) => p.id === id)!;
      const c = el(`div.card${st.power === id ? '.on' : ''}`, { onclick: () => { this.ctx.store.set({ power: id }); this.flyout.replaceChildren(); } },
        icon(POWER_ICON[id]), el('div.name', { text: t(`power.${id}`) }),
        el('div.meta', { text: free ? t('power.free') : t('power.cost', { n: def.costPerTile ?? def.cost }) }));
      c.dataset.tip = t(`power.${id}Desc`);
      return c;
    });
    this.radiusLabel = el('div.sub', { text: t('brush.size', { n: st.brushRadius }) });
    this.radiusInput = el('input', { type: 'range', min: 1, max: 6, step: 1, value: st.brushRadius, oninput: (e: Event) => this.ctx.store.set({ brushRadius: Number((e.target as HTMLInputElement).value) }) });
    const opts = el('div', { style: 'display:flex;flex-direction:column;gap:6px;min-width:140px' }, this.radiusLabel, this.radiusInput);
    if (st.power === 'plant_forest')
      opts.append(el('div.sub', { text: t('brush.kind') }), el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' },
        ...FOREST_KINDS.map((k) => el(`button.btn${st.powerOption === k ? '.on' : ''}`, { onclick: () => { this.ctx.store.set({ powerOption: k }); this.flyout.replaceChildren(); } }, t(`plant.${k}`)))));
    if (st.power === 'place_rock')
      opts.append(el('div.sub', { text: t('brush.rock') }), el('div', { style: 'display:flex;gap:4px' },
        ...['1', '2', '3'].map((k) => el(`button.btn${st.powerOption === k ? '.on' : ''}`, { onclick: () => { this.ctx.store.set({ powerOption: k }); this.flyout.replaceChildren(); } }, k))));
    this.flyout.replaceChildren(...cards, opts);
  }

  /** Flyouts of the Gifts (tray + gift powers), Nature and Wrath categories (§18.4). */
  private renderFlyout(): void {
    const st = this.ctx.store.state;
    if (st.activeTool === 'terraform') return this.renderTerraform();
    if (st.activeTool === 'nature' || st.activeTool === 'wrath') return void this.flyout.replaceChildren(...powerCards(this.ctx, st.activeTool), this.radiusBox());
    const tray = el(`div.card${st.armed ? '' : '.on'}`, { onclick: () => this.ctx.store.set({ armed: null }) }, icon('gift'),
      el('div.name', { text: t('power.gift_tray') }), el('div.meta', { text: this.ctx.game.world.s.god.mode === 'sandbox' ? t('power.free') : t('power.trayCost') }));
    tray.dataset.tip = t('power.gift_trayDesc');
    this.flyout.replaceChildren(tray, ...powerCards(this.ctx, 'gift'), this.radiusBox());
  }

  /** Radius slider for the armed area power (Shift+wheel does the same). */
  private radiusBox(): HTMLElement {
    const st = this.ctx.store.state;
    const def = POWER_DEFS.find((p) => p.id === st.armed);
    this.radiusLabel = this.radiusInput = this.castLabel = this.castInput = null;
    if (!def?.radius || def.radius[0] === def.radius[1]) return el('div.sub', { text: st.armed ? t('cast.hint') : '', style: 'max-width:150px;align-self:center' });
    const label = (this.castLabel = el('div.sub', { text: t('cast.radius', { n: st.castRadius }) }));
    const input = (this.castInput = el('input', { type: 'range', min: def.radius[0], max: def.radius[1], step: 1, value: st.castRadius,
      oninput: (e: Event) => this.ctx.store.set({ castRadius: Number((e.target as HTMLInputElement).value) }) }) as HTMLInputElement);
    return el('div', { style: 'display:flex;flex-direction:column;gap:6px;min-width:140px;align-self:center' }, label, input, el('div.sub', { text: t('cast.hint'), style: 'font-size:.75em' }));
  }

  update(): void {
    const st = this.ctx.store.state;
    this.root.classList.toggle('hidden', this.ctx.readOnly());
    const gentle = this.ctx.game.world.s.god.gentle;
    for (const [id, b] of this.btns) b.classList.toggle('on', st.activeTool === id);
    this.btns.get('wrath')?.classList.toggle('hidden', gentle); // §17.2 Gentle mode hides the Wrath category
    if (gentle && st.activeTool === 'wrath') this.choose('hand');
    const show = st.openPanels.flyout && !this.ctx.readOnly();
    this.flyout.classList.toggle('hidden', !show);
    const cat = st.activeTool === 'nature' || st.activeTool === 'wrath' ? st.activeTool : 'gift';
    const sig = `${st.activeTool}:${st.power}:${st.powerOption}:${st.settings.language}:${cardsSig(this.ctx, cat)}`;
    if (show && (!this.flyout.firstChild || sig !== this.flySig)) {
      this.flySig = sig;
      this.renderFlyout();
    }
    if (this.radiusLabel) this.radiusLabel.textContent = t('brush.size', { n: st.brushRadius });
    if (this.radiusInput && document.activeElement !== this.radiusInput) this.radiusInput.value = String(st.brushRadius);
    if (this.castLabel) this.castLabel.textContent = t('cast.radius', { n: st.castRadius });
    if (this.castInput && document.activeElement !== this.castInput) this.castInput.value = String(st.castRadius);
    if (!show) this.flyout.replaceChildren();
  }
}
