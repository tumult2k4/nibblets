import type { App } from './app';
import { el } from './dom';
import { onLangChange, t } from './i18n';
import { World } from '../sim/world';
import { createWorld, createWorldState, type WorldParams } from '../sim/newWorld';
import { deserialize, loadWorld } from '../sim/save';
import type { WorldState } from '../sim/state';
import { titleScreen } from './screens/titleScreen';
import { pauseMenu } from './screens/pauseMenu';
import { helpScreen } from './screens/help';
import { newWorldWizard } from './screens/newWorldWizard';
import { saveLoadScreen } from './screens/saveLoad';
import { settingsScreen } from './screens/settings';
import { QUICK_SLOT, deleteSlot, downloadJson, latestSlot, loadSlot, nextAutoSlot, pickJsonFile, saveSlot, thumbnail } from './saves';

type Overlay = 'pause' | 'saves' | 'settings' | 'help' | 'wizard' | null;

/** Screen + overlay management (§18.3): title (live observer island), wizard, pause, saves, settings, help, replay. */
export class Screens {
  private layer = el('div', { style: 'position:absolute;inset:0;pointer-events:none;z-index:20' });
  private banner = el('div.replay-banner.panel.hidden', {});
  private replayTarget = 0;

  constructor(private app: App) {
    app.root.append(this.layer, this.banner);
    onLangChange(() => {
      this.renderBanner();
      const o = this.app.store.state.overlay;
      if (o && o !== 'settings') this.open(o);
      else if (!o && this.app.store.state.screen === 'title') void this.renderTitle();
    });
    this.showTitle();
  }

  // ---- title ----
  showTitle(): void {
    const app = this.app;
    this.stopReplay();
    const w = createWorld({ seed: Math.floor(Math.random() * 1e6), mode: 'observer', founders: 12 });
    this.setWorld(w);
    app.game.speedIdx = 1;
    app.game.renderer.camera.autoOrbit = 0.05;
    app.store.set({ screen: 'title', overlay: null, selection: [], selectedKind: null });
    void this.renderTitle();
  }

  private async renderTitle(): Promise<void> {
    const latest = await latestSlot().catch(() => null);
    if (this.app.store.state.screen !== 'title' || this.app.store.state.overlay) return;
    this.mount(titleScreen({
      cont: latest ? () => void this.loadFrom(latest) : null,
      newWorld: () => this.open('wizard'),
      load: () => this.open('saves'),
      settings: () => this.open('settings'),
      replay: () => this.open('saves'),
      help: () => this.open('help'),
    }));
  }

  private mount(node: HTMLElement | null): void {
    this.layer.replaceChildren(...(node ? [node] : []));
    if (node) node.style.pointerEvents = 'auto';
  }

  private setWorld(w: World): void {
    this.app.game.setWorld(w);
    this.app.names.clear();
    this.app.log.clear();
    this.app.feed?.reset();
  }

  private enterGame(w: World): void {
    this.stopReplay();
    this.setWorld(w);
    const app = this.app;
    app.game.renderer.camera.autoOrbit = 0;
    app.game.speedIdx = 1;
    app.store.set({ screen: 'game', overlay: null, selection: [], selectedKind: null });
    this.mount(null);
    app.game.paused = false;
  }

  // ---- overlays ----
  open(o: Overlay): void {
    const app = this.app;
    const st = app.store.state;
    const onTitle = st.screen === 'title';
    const close = () => this.open(null);
    app.store.set({ overlay: o });
    app.game.paused = !!o && !onTitle;
    if (!o) {
      if (onTitle) void this.renderTitle();
      else this.mount(null);
      return;
    }
    const back = onTitle ? close : () => this.open('pause');
    switch (o) {
      case 'pause':
        return this.mount(pauseMenu({
          resume: () => this.open(null),
          save: () => this.open('saves'),
          load: () => this.open('saves'),
          settings: () => this.open('settings'),
          help: () => this.open('help'),
          exit: () => this.showTitle(),
        }));
      case 'help':
        return this.mount(helpScreen(st.overlay === 'pause' ? back : close));
      case 'wizard':
        return this.mount(newWorldWizard((p: WorldParams) => this.enterGame(createWorld(p)), close));
      case 'settings':
        return this.mount(settingsScreen(st.settings, app.game.world.s.god.gentle, (s, gentle) => {
          app.applySettings(s);
          if (!onTitle && !app.replayMode && gentle !== app.game.world.s.god.gentle) app.game.world.push({ type: 'set_gentle', on: gentle });
        }, onTitle ? close : back));
      case 'saves':
        return this.mount(saveLoadScreen({
          canSave: !onTitle && !app.replayMode,
          save: (slot) => this.saveTo(slot),
          load: (slot) => this.loadFrom(slot),
          replay: (slot) => this.replayFrom(slot),
          del: (slot) => deleteSlot(slot),
          exportSlot: async (slot) => {
            const d = await loadSlot(slot);
            if (d) downloadJson(`nibblets-${slot}.json`, d);
          },
          importFile: async () => {
            const d = await pickJsonFile();
            if (!d) return;
            try {
              this.enterGame(loadWorld(d));
            } catch (e) {
              console.error(e);
              app.toast(t('save.bad'), 'critical');
            }
          },
          close: onTitle ? close : back,
        }));
    }
  }

  // ---- saving ----
  private async saveTo(slot: string): Promise<void> {
    const r = this.app.game.renderer;
    await saveSlot(this.app.game.world.s, slot, thumbnail(r.gl.domElement));
    this.app.toast(t('save.saved'), 'info');
  }

  async autosave(): Promise<void> {
    if (this.app.store.state.screen !== 'game') return;
    try {
      await this.saveTo(await nextAutoSlot());
    } catch (e) {
      console.warn('autosave failed', e);
    }
  }

  async quickSave(): Promise<void> {
    if (this.app.store.state.screen !== 'game') return;
    await this.saveTo(QUICK_SLOT);
  }

  async quickLoad(): Promise<void> {
    if (!(await loadSlot(QUICK_SLOT))) return this.app.toast(t('save.noQuick'), 'info');
    await this.loadFrom(QUICK_SLOT);
  }

  private async loadFrom(slot: string): Promise<void> {
    const d = await loadSlot(slot);
    if (!d) return;
    try {
      this.enterGame(loadWorld(d));
      this.app.toast(t('save.loaded'), 'info');
    } catch (e) {
      console.error(e);
      this.app.toast(t('save.bad'), 'critical');
    }
  }

  // ---- replay (§3.5, P1.16): rebuild from genParams, feed the command log at its ticks, read-only ----
  private async replayFrom(slot: string): Promise<void> {
    const d = await loadSlot(slot);
    if (!d) return;
    const saved: WorldState = deserialize(d);
    const w = new World(createWorldState(saved.genParams));
    const log = saved.commandLog;
    let i = 0;
    while (i < log.length && log[i]!.tick < w.s.tick) i++;
    const step = w.step.bind(w);
    w.step = () => {
      while (i < log.length && log[i]!.tick === w.s.tick) w.queue.push(log[i++]!.cmd);
      const evs = step();
      if (w.s.tick >= this.replayTarget && this.app.game.speedIdx) {
        this.app.game.speedIdx = 0;
        this.app.toast(t('replay.done'), 'notable');
      }
      return evs;
    };
    this.enterGame(w);
    this.replayTarget = saved.tick;
    this.app.replayMode = true;
    this.app.store.set({ screen: 'replay' });
    this.renderBanner();
    this.banner.classList.remove('hidden');
  }

  private renderBanner(): void {
    this.banner.replaceChildren(el('b', { text: t('replay.banner') }), el('button.btn', { onclick: () => this.showTitle() }, t('replay.exit')));
  }

  private stopReplay(): void {
    this.app.replayMode = false;
    this.banner.classList.add('hidden');
  }
}
