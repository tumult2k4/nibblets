/**
 * Music notes (§15.5, P8.5): while a goblin plays, little notes rise from it in its own skin color, at the pace of
 * its "style" (a seed from its id: how fast it plays, which notes, how they drift). Read-only: it looks at the sim.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import { ageDays } from '../sim/goblin/goblin';
import { phenotypeOf } from '../sim/goblin/genetics/phenotype';
import { festMode } from './festivalPose';
import { FEST } from '../sim/ai/actions/festival';
import { hsl } from './lowpoly';

const GLYPHS = ['♪', '♫', '♬'];
const textures = new Map<string, THREE.Texture>();
function noteTexture(glyph: string): THREE.Texture {
  let t = textures.get(glyph);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d')!;
  x.font = 'bold 36px Fredoka, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 5;
  x.strokeStyle = '#2e2a24';
  x.strokeText(glyph, 24, 26);
  x.fillStyle = '#ffffff';
  x.fillText(glyph, 24, 26);
  textures.set(glyph, (t = new THREE.CanvasTexture(c)));
  return t;
}

interface Note { sprite: THREE.Sprite; age: number; sway: number; ox: number; oz: number }
const LIFE = 1.7, MAX = 60;

export class MusicFx {
  readonly group = new THREE.Group();
  private notes: Note[] = [];
  private due = new Map<number, number>();
  private colors = new Map<number, THREE.Color>();
  reducedMotion = false;

  constructor(private w: World) {}

  private color(id: number): THREE.Color {
    let c = this.colors.get(id);
    if (c) return c;
    const g = this.w.goblin(id)!;
    const sk = phenotypeOf({ genome: g.genome, ageDays: ageDays(g, this.w.s.tick), stage: g.lifeStage, hunger: g.needs.hunger, scars: g.health.scars }).skinColor;
    this.colors.set(id, (c = hsl(sk.h, Math.min(1, sk.s + 0.15), Math.min(0.75, sk.l + 0.1))));
    return c;
  }

  update(t: number, dt: number, head: (id: number) => THREE.Vector3 | null): void {
    for (const g of this.w.s.goblins) {
      if (festMode(g) !== FEST.play) { this.due.delete(g.id); continue; }
      const next = this.due.get(g.id) ?? t;
      if (t < next || this.notes.length >= MAX) continue;
      const style = (g.id * 2654435761) % 1000 / 1000; // the musician's style: tempo, notes, drift
      this.due.set(g.id, t + 0.3 + style * 0.35);
      const p = head(g.id);
      if (!p) continue;
      const m = new THREE.SpriteMaterial({ map: noteTexture(GLYPHS[Math.floor(style * 3 + t * 2) % 3]!), color: this.color(g.id), transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(m);
      sprite.renderOrder = 5;
      sprite.position.copy(p);
      this.group.add(sprite);
      this.notes.push({ sprite, age: 0, sway: 1.5 + style * 3, ox: p.x, oz: p.z });
    }
    for (const n of [...this.notes]) {
      n.age += dt;
      if (n.age > LIFE) {
        this.group.remove(n.sprite);
        n.sprite.material.dispose();
        this.notes.splice(this.notes.indexOf(n), 1);
        continue;
      }
      const k = n.age / LIFE;
      n.sprite.scale.setScalar(0.28 * Math.min(1, n.age / 0.2));
      n.sprite.material.opacity = 1 - k * k;
      if (this.reducedMotion) continue;
      n.sprite.position.set(n.ox + Math.sin(n.age * n.sway) * 0.15, n.sprite.position.y + dt * 0.55, n.oz + Math.cos(n.age * n.sway) * 0.08);
    }
  }
}
