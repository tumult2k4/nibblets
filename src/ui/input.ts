import type { Ctx } from './ctx';
import { HandTool } from './tools/handTool';
import { TrayDrag } from './tools/trayDrag';
import { actionFor } from './keys';

export interface KeyHandlers { [action: string]: () => void }

/**
 * The single input router (§18.4): pointer + keyboard → camera or the active tool.
 * RMB drag orbits, MMB drag pans, wheel zooms (or changes hold height / tray quantity).
 */
export class Input {
  readonly hand: HandTool;
  readonly tray: TrayDrag;
  private keysDown = new Set<string>();
  private drag: { button: number; x: number; y: number; moved: boolean } | null = null;
  private mouse = { x: 0, y: 0, inside: false };
  onTraySlot: (i: number) => void = () => {};

  constructor(private ctx: Ctx, private canvas: HTMLCanvasElement, private handlers: KeyHandlers, private escape: () => void) {
    this.hand = new HandTool(ctx);
    this.tray = new TrayDrag(ctx);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointerenter', () => (this.mouse.inside = true));
    canvas.addEventListener('pointerleave', () => (this.mouse.inside = false));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('wheel', (e) => { if (this.tray.active) { e.preventDefault(); this.tray.wheel(e.deltaY); } }, { passive: false });
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  private get cam() {
    return this.ctx.game.renderer.camera;
  }

  private down(e: PointerEvent): void {
    this.canvas.focus();
    if (e.button === 0 && !this.tray.active) this.hand.down(e);
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
  }

  private move(e: PointerEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    if (this.tray.active) {
      this.tray.move(e);
      return;
    }
    const d = this.drag;
    if (d && (d.button === 2 || d.button === 1)) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved = true;
      const inv = this.ctx.store.state.settings.invertOrbit ? -1 : 1;
      if (d.button === 2) this.cam.orbit(-dx * 0.006 * inv, dy * 0.005 * inv);
      else this.cam.pan(-dx * 0.1, -dy * 0.1);
      return;
    }
    if (e.target === this.canvas || this.hand.holding || (d && d.button === 0)) this.hand.move(e);
  }

  private up(e: PointerEvent): void {
    if (this.tray.active) {
      this.tray.up(e, e.target === this.canvas);
      this.drag = null;
      return;
    }
    if (this.drag?.button === 0) this.hand.up(e);
    this.drag = null;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.tray.active) return;
    if (this.hand.wheel(e.deltaY)) return;
    this.cam.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
  }

  private key(e: KeyboardEvent): void {
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA')) return;
    if ((window as unknown as { __rebinding?: boolean }).__rebinding) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.tray.active) this.tray.cancel();
      else if (this.hand.holding) this.hand.cancel();
      else this.escape();
      return;
    }
    this.keysDown.add(e.code);
    const action = actionFor(e.code);
    // number keys pick tray slots only while the tray is hovered (§18.11 note)
    if (/^Digit[1-9]$/.test(e.code) && this.ctx.store.state.openPanels.tray && document.querySelector('.tray:hover')) {
      this.onTraySlot(Number(e.code.slice(5)) - 1);
      return;
    }
    if (action && this.handlers[action]) {
      e.preventDefault();
      this.handlers[action]!();
    }
  }

  /** Continuous camera keys + edge panning. */
  frame(dt: number): void {
    if (this.ctx.store.state.screen === 'title') return;
    const k = this.keysDown;
    const sp = 40 * dt;
    let dx = 0, dz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) dz -= sp;
    if (k.has('KeyS') || k.has('ArrowDown')) dz += sp;
    if (k.has('KeyA') || k.has('ArrowLeft')) dx -= sp;
    if (k.has('KeyD') || k.has('ArrowRight')) dx += sp;
    if (this.ctx.store.state.settings.edgePan && this.mouse.inside) {
      const m = 12;
      if (this.mouse.x < m) dx -= sp;
      if (this.mouse.x > window.innerWidth - m) dx += sp;
      if (this.mouse.y < m) dz -= sp;
      if (this.mouse.y > window.innerHeight - m) dz += sp;
    }
    if (dx || dz) this.cam.pan(dx, dz);
    if (k.has('KeyQ') && actionFor('KeyQ') === 'rotL') this.cam.orbit(dt * 1.5, 0);
    if (k.has('KeyE') && actionFor('KeyE') === 'rotR') this.cam.orbit(-dt * 1.5, 0);
    this.hand.frame();
  }
}
