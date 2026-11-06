import type { EntityKind } from '../render/picking';
import './theme.css';
import type { Game } from '../game';
import type { ID, SimEvent, Vec2 } from '../shared/types';
import type { Command } from '../sim/commands';
import { el } from './dom';
import { injectIcons } from './icons';
import { getLang, onLangChange, setLang, t } from './i18n';
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
import { VillagePanel } from './components/villagePanel';
import { PrayersPanel } from './components/prayersPanel';
import { VoicePanel } from './components/voicePanel';
import { PlaceLabels } from './placeLabels';
import { EventLog } from '../llm/eventLog';
import { LlmDirector, type SpokenLine } from '../llm/director';
import { earnDeed, type DeedId } from './deeds';
import { VoiceFx } from './voiceFx';
import { StatsPanel } from './components/statsPanel';
import { FamilyTree } from './components/familyTree';
import { Journal } from './components/journal';
import { SandboxDrawer } from './components/sandbox/drawer';
import { QuickRing } from './components/quickRing';
import { Input } from './input';
import { noteFor } from './notify';
import { Screens } from './appScreens';
import { WorldFx } from './worldFx';
import { keyHandlers } from './appKeys';
import { DirectorCam } from './components/directorCam';
import { Codex } from './components/codex';
import { Timeline } from './components/timeline';
import { Tips } from './components/tips';
import { PossessBar } from './components/possessBar';
import { deedsFrom } from './deedWatch';
import { PhotoBar } from './components/photoBar';

const LINE_MS = 1500;

/** Wires the UI shell (§18) to the game: components, input, overlays, notifications. */
export class App implements Ctx {
  readonly store = new Store(initialState());
  readonly root: HTMLElement;
  input!: Input;
  screens!: Screens;
  fx!: WorldFx;
  topBar!: TopBar;
  toolbar!: GodToolbar;
  feed!: Feed;
  tray!: GiftTray;
  minimap!: Minimap;
  voice!: VoicePanel;
  /** P11.1: the Director camera (C) */
  dircam!: DirectorCam;
  /** P11.1: first-session tips */
  tips!: Tips;
  /** P11.2: photo mode (F12) */
  readonly photo: PhotoBar;
  /** P9.2: place names over the map */
  readonly places = new PlaceLabels(this);
  /** P9.2: what happened, by day, for the LLM layer's prompts (never read by the sim) */
  readonly log = new EventLog();
  /** P9.4: diaries, dialogue and barks, and the bubbles they are spoken in */
  readonly speech = new VoiceFx(this);
  readonly director = new LlmDirector(this.log, { world: () => this.game.world.s, lang: getLang, say: (k, ls) => this.say(k, ls), onPause: () => this.llmPaused(),
    named: (name) => this.toast(t('village.named', { name }), 'notable'),
    godNamed: (name) => this.toast(t('voice.godNamed', { name }), 'notable'),
    deed: (id, n) => this.earn(id, t(`deed.${id}.how`, n)) });
  private pauseToast = -Infinity;
  private comps: Component[] = [];
  private hud = el('div', { style: 'position:absolute;inset:0;pointer-events:none' });
  private lastUpdate = 0;
  names = new Map<ID, string>();
  replayMode = false;

  constructor(public game: Game, readonly canvas: HTMLCanvasElement) {
    injectIcons();
    this.root = document.getElementById('ui')!;
    this.photo = new PhotoBar(this);
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
    this.toolbar = new GodToolbar(this);
    this.voice = new VoicePanel(this);
    this.dircam = new DirectorCam(this);
    this.tips = new Tips(this);
    this.comps = [this.dircam, this.topBar, this.toolbar, new Inspector(this), this.feed, this.tray, this.minimap, new DebugOverlay(this), new VillagePanel(this), new PrayersPanel(this), this.voice, new StatsPanel(this), new FamilyTree(this), new Journal(this), new SandboxDrawer(this), new Codex(this), new Timeline(this), this.tips, new PossessBar(this),
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
    this.photo.frame(dt);
    this.fx.frame(dt);
    this.places.frame();
    this.director.frame();
    this.speech.frame();
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
    this.log.record(evs, w.s);
    if (!this.replayMode) this.director.onEvents(evs);
    this.dircam.onEvents(evs);
    if (!this.replayMode) for (const [id, p] of deedsFrom(evs, w)) this.earn(id, t(`deed.${id}.how`, p)); // P11.1
    for (const e of evs) {
      const n = noteFor(e, w, this.names);
      if (n) {
        this.feed.add(n);
        if (n.tier === 'critical') this.topBar.alertCount++;
      }
      if (e.type === 'goblin_died' && this.store.state.settings.autopauseDeath) this.game.speedIdx = 0;
      if (e.type === 'day_started' && !this.replayMode) void this.screens.autosave();
      if (e.type === 'command_rejected') document.querySelector('.toolbar .btn.on')?.classList.add('shake');
      if (e.type === 'god_spoke') this.voice.spoke(e); // P8.9: the sign in the sky, the replies
      if (e.type === 'wish_fulfilled') this.voice.kept(e);
    }
  }

  /** Speech over the heads (§19.7): a bark at once; dialogue a line every 1.5 s, each until its speaker talks again. */
  private say(kind: 'dialogue' | 'bark', lines: SpokenLine[]): void {
    if (kind === 'bark') return this.speech.bubble(lines[0]!.goblinId, lines[0]!.text, 0, { typed: true, ms: 3500 });
    lines.forEach((l, i) => {
      const next = lines.findIndex((m, j) => j > i && m.goblinId === l.goblinId);
      this.speech.bubble(l.goblinId, l.text, i * LINE_MS, { typed: true, ms: next < 0 ? LINE_MS + 3000 : (next - i) * LINE_MS });
    });
  }

  /** A divine deed (§17.10): kept in this browser, told once. */
  earn(id: DeedId, how: string): void {
    if (earnDeed(id, how)) this.toast(`${t('deed.earned', { deed: t(`deed.${id}`) })} · ${how}`, 'notable');
  }

  private llmPaused(): void {
    const now = performance.now();
    if (now - this.pauseToast < 5 * 60_000) return;
    this.pauseToast = now;
    this.toast(t('llm.paused'), 'info');
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
    if (this.photo.on) return this.photo.toggle(); // P11.2
    if (st.overlay) return this.screens.open(st.screen === 'title' ? null : null);
    if (st.screen === 'title') return;
    if (this.voice.wheel.isOpen) return this.voice.wheel.close();
    if (this.input.possess.release()) return; // P11.1: let the possessed goblin go
    if (st.openPanels.tray || st.openPanels.flyout) return this.store.set({ activeTool: 'hand', openPanels: { ...st.openPanels, tray: false, flyout: false } });
    if (st.selection.length) return this.select(null, []);
    this.screens.open('pause');
  }

  applySettings(s: Settings): void {
    this.store.set({ settings: s });
    savePref('settings', s);
    setLang(s.language);
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    document.documentElement.style.setProperty('--journal-font', String(s.journalFont ?? 1)); // P11.4
    for (const [c, on] of [['hc', s.highContrast], ['cb', s.colorSafe], ['rm', s.reducedMotion]] as const) document.body.classList.toggle(c, !!on);
    this.game.renderer.applySettings({ shadows: s.shadows, renderScale: s.renderScale, outlines: s.outlines, fog: s.fog });
    this.game.renderer.emotes.reducedMotion = s.reducedMotion;
    this.game.renderer.weatherFx.reduced = s.reducedMotion;
    this.game.renderer.wrathFx.reduced = s.reducedMotion;
    this.game.renderer.miracleFx.reduced = s.reducedMotion;
    this.game.renderer.music.reducedMotion = s.reducedMotion;
  }

  t = t;
}
