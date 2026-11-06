/**
 * Place names on the map (§15.6, P9.2): soft labels floating over each named place, shown while the toggle is on
 * (X, or the chip under the minimap). Plain DOM over the canvas, placed every frame, under the HUD.
 */
import * as THREE from 'three';
import type { App } from './app';
import { getLang } from './i18n';
import { placesOf } from '../sim/places';
import { placeName } from '../llm/placeNames';
import type { ID } from '../shared/types';

export class PlaceLabels {
  private els = new Map<ID, HTMLDivElement>();
  private lang = '';
  private v = new THREE.Vector3();

  constructor(private app: App) {}

  frame(): void {
    const on = this.app.store.state.settings.placeNames !== false && this.app.store.state.screen !== 'title';
    const s = this.app.game.world.s, places = on ? placesOf(s) : [];
    if (this.lang !== getLang()) { this.clear(); this.lang = getLang(); }
    if (places.length < this.els.size) this.clear(); // a world was loaded
    const r = this.app.game.renderer;
    for (const p of places) {
      let d = this.els.get(p.id);
      if (!d) {
        d = document.createElement('div');
        d.className = 'placelabel';
        d.textContent = placeName(p, getLang());
        this.app.root.before(d);
        this.els.set(p.id, d);
      }
      const sc = r.toScreen(this.v.set(p.pos.x + 0.5, r.terrainY(p.pos.x + 0.5, p.pos.y + 0.5) + 1.2, p.pos.y + 0.5));
      d.classList.toggle('hidden', !sc.visible);
      d.style.transform = `translate(${Math.round(sc.x)}px, ${Math.round(sc.y)}px) translate(-50%, -100%)`;
    }
    if (!on && this.els.size) this.clear();
  }

  clear(): void {
    for (const d of this.els.values()) d.remove();
    this.els.clear();
  }
}
