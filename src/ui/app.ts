import type { EntityKind } from '../render/picking';
import './theme.css';
import type { Game } from '../game';
import type { ID, SimEvent, Vec2 } from '../shared/types';
import type { Command } from '../sim/commands';
import { el } from './dom';
import { injectIcons } from './icons';
import { onLangChange, setLang, t } from './i18n';
import { Store, initialState, savePref, type Settings } from './store';
import type { Component, Ctx } from './ctx';
import { Tooltip } from './components/tooltip';
import { TopBar } from './components/topBar';
import { GodToolbar } from './components/godToolbar';
import { GiftTray } from './components/giftTray';
import { Inspector } from './components/inspector/inspector';
import { Feed } from './components/feed';
import { Minimap } from './components/minimap';
import { DebugOverlay } from './components/debugOverlay';
import { QuickRing } from './components/quickRing';
import { Input } from './input';
import { noteFor } from './notify';
import { Screens } from './appScreens';
import { WorldFx } from './worldFx';
import { keyHandlers } from './appKeys';

/** Wires the UI shell (§18) to the game: components, input, overlays, notifications. */
export class App implements Ctx {
  readonly store = new Store(initialState());
  readonly root: HTMLElement;
  input!: Input;
  screens!: Screens;
  fx!: WorldFx;
  topBar!: TopBar;
  feed!: Feed;
  tray!: GiftTray;
  minimap!: Minimap;
  private comps: Component[] = [];
  private hud = el('div', { style: 'position:absolute;inset:0;pointer-events:none' });
  private lastUpdate = 0;
  names = new Map<ID, string>();
  replayMode = false;

  constructor(public game: Game, canvas: HTMLCanvasElement) {
    injectIcons();
    this.root = document.getElementById('ui')!;
    this.applySettings(this.store.state.settings);
    this.screens = new Screens(this);
    this.fx = new WorldFx(this);
    this.input = new Input(this, canvas, keyHandlers(this), () => this.escape());
    this.input.onTraySlot = (i) => {
      const item = this.tray.itemAt(i);
      if (item) this.input.tray.dropAt(item, this.input.hand.ground);
    };
    this.input.tray.onQty = (n) => (this.tray.qty = n);
    this.mountHud();
    onLangChange(() => this.mountHud());
    this.store.subscribe((s, prev) => {
      if (s.lens !== prev.lens) this.minimap.renderLenses();
      this.updateHud();
    });
    game.onEvents((evs) => this.onEvents(evs));
    game.onFrame((dt) => this.frame(dt));
    canvas.tabIndex = 0;
  }

  private mountHud(): void {
    for (const c of this.comps) c.destroy?.();
    this.hud.replaceChildren();
    const hud = el('div', { style: 'position:absolute;inset:0;pointer-events:none' });
    this.topBar = new TopBar(this);
    this.feed = new Feed(this);
    this.tray = new GiftTray(this, (item, e) => this.input.tray.start(item, e));
    this.minimap = new Minimap(this);
    this.comps = [this.topBar, new GodToolbar(this), new Inspector(this), this.feed, this.tray, this.minimap, new DebugOverlay(this),
      new QuickRing(this, {
        pickUp: (id) => this.push({ type: 'god_grab', entityId: id }),
        pet: (id) => this.push({ type: 'god_pet', goblinId: id, ticks: 30 }),
        poke: (id) => this.push({ type: 'god_poke', goblinId: id }),
      }), new Tooltip(this)];
    for (const c of this.comps) c.mount(hud);
    for (const ch of [...hud.children] as HTMLElement[]) ch.style.pointerEvents = ch.classList.contains('toasts') || ch.classList.contains('qring') ? 'none' : 'auto';
    this.hud.replaceWith(hud);
    this.hud = hud;
    if (!this.hud.isConnected) this.root.append(this.hud);
    this.updateHud();
  }

  updateHud(): void {
    const inGame = this.store.state.screen !== 'title';
    this.hud.classList.toggle('hidden', !inGame);
    if (inGame) for (const c of this.comps) c.update();
  }

  private frame(dt: number): void {
    this.input.frame(dt);
    this.fx.frame(dt);
    if (this.store.state.screen !== 'title') for (const c of this.comps) c.frame?.(dt);
    const now = performance.now();
    if (now - this.lastUpdate > 100) {
      this.lastUpdate = now;
      this.updateHud();
    }
  }

  private onEvents(evs: SimEvent[]): void {
    if (this.store.state.screen === 'title') return;
    const w = this.game.world;
    for (const g of w.s.goblins) this.names.set(g.id, g.name);
    for (const e of evs) {
      const n = noteFor(e, w, this.names);
      if (n) {
        this.feed.add(n);
        if (n.tier === 'critical') this.topBar.alertCount++;
      }
      if (e.type === 'goblin_died' && this.store.state.settings.autopauseDeath) this.game.speedIdx = 0;
      if (e.type === 'day_started' && !this.replayMode) void this.screens.autosave();
      if (e.type === 'command_rejected') document.querySelector('.toolbar .btn.on')?.classList.add('shake');
    }
  }

  // ---- Ctx ----
  push(cmd: Command): void {
    if (!this.readOnly()) this.game.world.push(cmd);
  }
  readOnly(): boolean {
    return this.replayMode;
  }
  select(kind: EntityKind | null, ids: ID[]): void {
    this.store.set({ selection: ids, selectedKind: ids.length ? kind : null, openPanels: { ...this.store.state.openPanels, inspector: true } });
  }
  flyTo(p: Vec2): void {
    this.game.renderer.camera.followId = null;
    this.game.renderer.camera.flyTo(p.x, p.y);
  }
  follow(id: ID | null): void {
    this.game.renderer.camera.followId = id;
  }
  toast(text: string, tier: 'info' | 'notable' | 'critical', at?: Vec2, id?: ID): void {
    this.feed.toast({ text, tier, icon: 'star', ...(at ? { at } : {}), ...(id !== undefined ? { id } : {}) });
  }
  openOverlay(o: 'pause' | 'saves' | 'settings' | 'help' | 'wizard' | null): void {
    this.screens.open(o);
  }
  quickSave(): Promise<void> {
    return this.screens.quickSave();
  }
  quickLoad(): Promise<void> {
    return this.screens.quickLoad();
  }

  private escape(): void {
    const st = this.store.state;
    if (st.overlay) return this.screens.open(st.screen === 'title' ? null : null);
    if (st.screen === 'title') return;
    if (st.openPanels.tray || st.openPanels.flyout) return this.store.set({ activeTool: 'hand', openPanels: { ...st.openPanels, tray: false, flyout: false } });
    if (st.selection.length) return this.select(null, []);
    this.screens.open('pause');
  }

  applySettings(s: Settings): void {
    this.store.set({ settings: s });
    savePref('settings', s);
    setLang(s.language);
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    this.game.renderer.applySettings({ shadows: s.shadows, renderScale: s.renderScale, outlines: s.outlines, fog: s.fog });
    this.game.renderer.emotes.reducedMotion = s.reducedMotion;
    this.game.renderer.weatherFx.reduced = s.reducedMotion;
  }

  t = t;
}
