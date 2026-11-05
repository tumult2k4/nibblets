import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/patrick-hand/400.css';
import { createWorld } from './sim/newWorld';
import { Renderer } from './render/renderer';
import { Game } from './game';
import { App } from './ui/app';
import { DEFAULT_SETTINGS, loadPref, type Settings } from './ui/store';

const canvas = document.getElementById('world') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
const s: Settings = { ...DEFAULT_SETTINGS, ...loadPref<Partial<Settings>>('settings', {}) };
// placeholder world; the App immediately swaps in the title-screen island
const renderer = new Renderer(canvas, createWorld({ seed: 1, size: 32, founders: 0 }), {
  shadows: s.shadows, renderScale: s.renderScale, outlines: s.outlines, fog: s.fog,
});
const game = new Game(renderer.world, renderer);
const app = new App(game, canvas);
window.addEventListener('resize', () => renderer.resize());
game.start();
(window as unknown as { game: Game; app: App }).game = game;
(window as unknown as { app: App }).app = app;
