import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/patrick-hand/400.css';
import { createWorld } from './sim/newWorld';
import { Renderer } from './render/renderer';
import { Game } from './game';

const canvas = document.getElementById('world') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.style.margin = '0';
const world = createWorld({ seed: 1234 });
const renderer = new Renderer(canvas, world, { shadows: 'high', renderScale: 1, outlines: true, fog: true });
const game = new Game(world, renderer);
window.addEventListener('resize', () => renderer.resize());
game.start();
(window as unknown as { game: Game }).game = game;
