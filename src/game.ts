import type { World } from './sim/world';
import type { SimEvent } from './shared/types';
import type { Renderer } from './render/renderer';
import { CFG } from './sim/config';

export const SPEEDS = [0, 1, 4, 16, 64] as const;
const MAX_TICKS_PER_FRAME = 64;

type Listener = (events: SimEvent[]) => void;

/**
 * Main loop: fixed 10 Hz sim ticks scaled by speed, at most 64 ticks per frame (drop time rather than
 * spiral), interpolation alpha for the renderer (§3.1).
 */
export class Game {
  speedIdx = 1;
  private acc = 0;
  private last = 0;
  private listeners: Listener[] = [];
  private frameListeners: ((dt: number) => void)[] = [];
  fps = 60;
  tickMs = 0;
  paused = false; // menu pause, independent of speed

  constructor(public world: World, public renderer: Renderer) {}

  setWorld(w: World): void {
    this.world = w;
    this.renderer.setWorld(w);
    this.acc = 0;
  }

  onEvents(fn: Listener): void {
    this.listeners.push(fn);
  }
  onFrame(fn: (dt: number) => void): void {
    this.frameListeners.push(fn);
  }

  get speed(): number {
    return SPEEDS[this.speedIdx]!;
  }

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
      this.last = now;
      this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
      const tickDur = 1 / CFG.tickHz;
      if (!this.paused && this.speed > 0) this.acc += dt * this.speed;
      let n = 0;
      const batch: SimEvent[] = [];
      let ms = 0;
      while (this.acc >= tickDur && n < MAX_TICKS_PER_FRAME) {
        this.acc -= tickDur;
        // apply god commands even while paused? no: commands wait for the next tick
        for (const e of this.world.step()) batch.push(e);
        ms += this.world.lastTickMs;
        this.renderer.onTick();
        n++;
      }
      if (n) this.tickMs = this.tickMs * 0.9 + (ms / n) * 0.1;
      if (n >= MAX_TICKS_PER_FRAME) this.acc = 0; // behind: drop time
      // while paused, still apply queued god commands so the hand stays responsive (see World.applyNow)
      if (!n && this.world.queue.length) for (const e of this.world.applyNow()) batch.push(e);
      if (batch.length) for (const l of this.listeners) l(batch);
      const alpha = Math.min(1, this.acc / tickDur);
      for (const f of this.frameListeners) f(dt);
      this.renderer.frame(dt, this.speed === 0 || this.paused ? 1 : alpha);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
