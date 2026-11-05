import type { App } from './app';
import { LENSES } from './store';
import type { KeyHandlers } from './input';

/** Keyboard shortcut handlers (§18.11). */
export function keyHandlers(app: App): KeyHandlers {
  const st = () => app.store.state;
  const inGame = () => st().screen !== 'title' && !st().overlay;
  const panel = (k: 'inspector' | 'feed' | 'debug') => app.store.set({ openPanels: { ...st().openPanels, [k]: !st().openPanels[k] } });
  const speed = (i: number) => () => inGame() && app.topBar.setSpeed(i);
  return {
    pause: () => inGame() && app.topBar.setSpeed(app.game.speedIdx === 0 ? 1 : 0),
    speed1: speed(1), speed2: speed(2), speed3: speed(3), speed4: speed(4),
    hand: () => inGame() && app.store.set({ activeTool: 'hand', armed: null, openPanels: { ...st().openPanels, tray: false, flyout: false } }),
    terraform: () => inGame() && !app.readOnly() && app.toolbar.choose('terraform'),
    nature: () => inGame() && !app.readOnly() && app.toolbar.choose('nature'),
    wrath: () => inGame() && !app.readOnly() && !app.game.world.s.god.gentle && app.toolbar.choose('wrath'),
    gifts: () => inGame() && !app.readOnly() && app.store.set({ activeTool: 'gifts', armed: null, openPanels: { ...st().openPanels, tray: !st().openPanels.tray, flyout: !st().openPanels.tray } }),
    follow: () => {
      const id = st().selection[0];
      if (id !== undefined && st().selectedKind === 'goblin') app.follow(app.game.renderer.camera.followId === id ? null : id);
    },
    lens: () => app.store.set({ lens: LENSES[(LENSES.indexOf(st().lens) + 1) % LENSES.length]! }),
    cycle: () => {
      const gs = app.game.world.s.goblins;
      if (!gs.length || !inGame()) return;
      const cur = st().selection[0];
      const i = gs.findIndex((g) => g.id === cur);
      const g = gs[(i + 1) % gs.length]!;
      app.select('goblin', [g.id]);
      app.flyTo(g.pos);
    },
    quicksave: () => inGame() && void app.quickSave(),
    quickload: () => st().screen !== 'title' && void app.quickLoad(),
    debug: () => panel('debug'),
    inspector: () => panel('inspector'),
    feed: () => panel('feed'),
    help: () => app.openOverlay(st().overlay === 'help' ? null : 'help'),
    rotL: () => {}, rotR: () => {}, // continuous, handled in Input.frame
  };
}
