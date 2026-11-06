/**
 * What the god's voice looks like (§17.7.1, P8.9): a giant glowing pictogram in the sky above the addressees for
 * 4 s, and the goblins' replies as speech bubbles over their heads. Plain DOM over the canvas, placed every frame.
 */
import * as THREE from 'three';
import type { App } from './app';
import type { ID } from '../shared/types';

interface Floater { el: HTMLDivElement; ids: ID[]; until: number; lift: number; born: number }

const SIGN_MS = 4000, BUBBLE_MS = 4500;

export class VoiceFx {
  private items: Floater[] = [];

  constructor(private app: App) {}

  /** The sign in the sky over `ids` (their middle). */
  sign(glyph: string, ids: ID[]): void {
    const d = document.createElement('div');
    d.className = 'skysign';
    d.textContent = glyph;
    this.app.root.before(d); // under the HUD
    const now = performance.now();
    this.items.push({ el: d, ids: ids.slice(0, 40), until: now + SIGN_MS, lift: 6, born: now });
  }

  /** A reply over one goblin's head. */
  bubble(id: ID, text: string, delay = 0): void {
    const d = document.createElement('div');
    d.className = 'speechbubble hidden';
    d.textContent = text;
    this.app.root.before(d); // under the HUD
    const now = performance.now() + delay;
    this.items.push({ el: d, ids: [id], until: now + BUBBLE_MS, lift: 1.5, born: now });
  }

  frame(): void {
    if (!this.items.length) return;
    const now = performance.now(), r = this.app.game.renderer;
    this.items = this.items.filter((f) => {
      if (now > f.until) { f.el.remove(); return false; }
      if (now < f.born) return true;
      const ps = f.ids.map((id) => r.goblinWorldPos(id)).filter((p): p is THREE.Vector3 => !!p);
      if (!ps.length) { f.el.classList.add('hidden'); return true; }
      const c = ps.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / ps.length);
      const sc = r.toScreen(c.setY(c.y + f.lift));
      f.el.classList.toggle('hidden', !sc.visible);
      const k = Math.min(1, (now - f.born) / 300, (f.until - now) / 600);
      f.el.style.opacity = String(Math.max(0, k));
      f.el.style.transform = `translate(${Math.round(sc.x)}px, ${Math.round(sc.y)}px) translate(-50%, -100%)`;
      return true;
    });
  }

  clear(): void {
    for (const f of this.items) f.el.remove();
    this.items = [];
  }
}
