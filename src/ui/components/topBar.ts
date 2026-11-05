import { el, setText } from '../dom';
import { icon } from '../icons';
import { t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import { SPEEDS } from '../../game';
import { tipKey } from './tooltip';
import { isFood, itemDef } from '../../sim/items';
import { CFG } from '../../sim/config';
import { keyLabel } from '../keys';
import { WEATHER_KINDS } from '../../sim/weather';
import type { WeatherKind } from '../../shared/types';

const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: 'sun', cloudy: 'cloud', fog: 'fog', rain: 'rain', storm: 'storm', snow: 'snow', blizzard: 'snow', heatwave: 'heat',
};

/** Top bar (§18.2): menu, village, calendar, weather, population, food, faith, mode badge, speed, alerts. */
export class TopBar implements Component {
  private root = el('div.topbar.panel');
  private village = el('span.village.clickable', { onclick: () => this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, village: !this.ctx.store.state.openPanels.village } }) });
  private cal = el('span.stat');
  private weather = el('span.stat.clickable', { onclick: () => this.weatherMenu() });
  private wxMenu = el('div.wxmenu.panel.hidden');
  private pop = el('span.stat');
  private food = el('span.stat');
  private faith = el('span.stat');
  private mode = el('span.badge');
  private speedBtns: HTMLButtonElement[] = [];
  private alerts = el('span.alert-count.hidden');
  alertCount = 0;

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    const menu = el('button.btn.iconbtn', { onclick: () => this.ctx.openOverlay('pause') }, icon('menu'));
    menu.dataset.tip = tipKey(t('top.menu'), 'Esc');
    const speed = el('span.speed');
    SPEEDS.forEach((s, i) => {
      const b = el('button.btn', { onclick: () => this.setSpeed(i) }, i === 0 ? icon('pause') : '▸'.repeat(i));
      b.dataset.tip = i === 0 ? tipKey(t('top.pause'), keyLabel('pause')) : tipKey(t('top.speed', { n: s }), keyLabel(`speed${i}`));
      this.speedBtns.push(b);
      speed.append(b);
    });
    const bell = el('button.btn.iconbtn', { onclick: () => { this.alertCount = 0; this.ctx.store.set({ openPanels: { ...this.ctx.store.state.openPanels, feed: true } }); this.update(); } }, icon('bell'), this.alerts);
    bell.dataset.tip = t('top.alerts');
    this.root.append(menu, this.village, el('span.sep'), this.cal, this.weather, el('span.sep'), this.pop, this.food, this.faith, el('span.grow'), this.mode, speed, bell);
    parent.append(this.root, this.wxMenu);
    window.addEventListener('pointerdown', (e) => {
      if (!this.wxMenu.contains(e.target as Node) && !this.weather.contains(e.target as Node)) this.wxMenu.classList.add('hidden');
    });
  }

  /** Sandbox: pick the weather directly (logged as a command, so replays match). */
  private weatherMenu(): void {
    const w = this.ctx.game.world;
    if (w.s.god.mode !== 'sandbox' || this.ctx.readOnly()) return;
    if (!this.wxMenu.classList.contains('hidden')) return void this.wxMenu.classList.add('hidden');
    const r = this.weather.getBoundingClientRect();
    this.wxMenu.style.left = `${r.left}px`;
    this.wxMenu.style.top = `${r.bottom + 6}px`;
    this.wxMenu.replaceChildren(...WEATHER_KINDS.map((k) => el(`button.btn${w.s.weather.kind === k ? '.on' : ''}`, {
      onclick: () => { w.push({ type: 'sandbox', op: { op: 'set_weather', kind: k } }); this.wxMenu.classList.add('hidden'); },
    }, icon(WEATHER_ICON[k]), ` ${t(`weather.${k}`)}`)));
    this.wxMenu.classList.remove('hidden');
  }

  setSpeed(i: number): void {
    const g = this.ctx.game;
    g.speedIdx = i === 0 && g.speedIdx === 0 ? 1 : i;
    this.update();
  }

  update(): void {
    const w = this.ctx.game.world;
    const s = w.s;
    const c = w.clock;
    setText(this.village, s.village.name);
    this.village.dataset.tip = s.god.godName ? t('insp.glanceGod', { name: s.god.godName }) : t('insp.glance');
    const hh = Math.floor(c.hour), mm = Math.floor((c.hour % 1) * 60);
    setText(this.cal, `${t('top.day', { season: t(`season.${c.season}`), day: c.seasonDay + 1 })} · ${t('top.year', { year: c.year })} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const wx = s.weather;
    const deg = Math.round(wx.temperature);
    const hoursLeft = Math.max(0, Math.ceil((wx.nextChangeTick - s.tick) / CFG.god.hourTicks));
    const cellKey = wx.cells.map((cl) => `${cl.id}:${Math.ceil((cl.untilTick - s.tick) / CFG.god.hourTicks)}`).join(',');
    const key = `${wx.kind}:${c.phase === 'night'}:${deg}:${wx.upcoming}:${hoursLeft}:${cellKey}:${this.ctx.store.state.settings.language}`;
    if (this.weather.dataset.k !== key) {
      const ic = wx.kind === 'clear' && c.phase === 'night' ? 'moon' : WEATHER_ICON[wx.kind];
      this.weather.replaceChildren(icon(ic), ` ${t(`weather.${wx.kind}`)} · ${deg}°C`);
      this.weather.dataset.k = key;
      // §P3.8 forecast tooltip: now, next change, and any local weather cells the god has called
      const cells = wx.cells.map((cl) => t('weather.cell', { w: t(`weather.${cl.kind === 'clear' && cl.tempOffset > 0 ? 'warm' : cl.kind}`), h: Math.max(1, Math.ceil((cl.untilTick - s.tick) / CFG.god.hourTicks)) }));
      this.weather.dataset.tip = t('weather.forecast2', { now: t(`weather.${wx.kind}`), t: deg, next: t(`weather.${wx.upcoming}`), h: hoursLeft })
        + (cells.length ? ` · ${t('weather.cells')}: ${cells.join(', ')}` : '')
        + (s.god.mode === 'sandbox' && !this.ctx.readOnly() ? ` · ${t('weather.setHint')}` : '');
    }
    const gs = s.goblins;
    const by = (st: string) => gs.filter((g) => g.lifeStage === st).length;
    const young = by('hatchling') + by('youngling');
    setText(this.pop, `${t('top.pop', { n: gs.length })} ${young ? t('top.young', { n: young }) : ''}`);
    this.pop.dataset.tip = t('top.popTip', { h: by('hatchling'), y: by('youngling'), a: by('adult'), e: by('elder') });
    // food reserve in days: nutrition available ÷ daily village need
    let nut = 0;
    for (const p of s.plants) if (p.kind === 'apple_bush') nut += p.fruit * (itemDef('apple').nutrition ?? 0);
    for (const it of s.groundItems) if (isFood(it.stack.type)) nut += it.stack.qty * (itemDef(it.stack.type).nutrition ?? 0);
    for (const g of gs) for (const st of g.inventory) if (isFood(st.type)) nut += st.qty * (itemDef(st.type).nutrition ?? 0);
    const need = Math.max(1, gs.length * CFG.goblin.decayPerDay.hunger);
    setText(this.food, t('top.food', { n: (nut / need).toFixed(1) }));
    const avgFaith = gs.length ? gs.reduce((a, g) => a + g.godView.faith, 0) / gs.length : 0;
    setText(this.faith, t('top.faith', { n: Math.round(avgFaith) }));
    setText(this.mode, this.ctx.readOnly() ? t('replay.banner') : s.god.mode === 'observer' ? t('top.observer') : t('top.sandbox'));
    const sp = this.ctx.game.speedIdx;
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === sp));
    this.alerts.classList.toggle('hidden', this.alertCount === 0);
    setText(this.alerts, String(this.alertCount));
  }
}
