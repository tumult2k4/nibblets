import * as THREE from 'three';
import type { ChatTopic, Emote, ID } from '../shared/types';
import { drawTopic } from './topicIcons';

/** An emote glyph, or a chat topic picture (`t:food`, P5.1). */
type Key = Emote | `t:${ChatTopic}`;

const GLYPH: Record<Emote, { text: string; color: string }> = {
  question: { text: '?', color: '#3b6fb6' },
  exclaim: { text: '!', color: '#d2452f' },
  heart: { text: '♥', color: '#e0547e' },
  zzz: { text: 'z', color: '#6a5fb0' },
  idea: { text: '✦', color: '#e0a822' },
  sweat: { text: '💧', color: '#4aa3d8' },
  music: { text: '♪', color: '#5a9a3c' },
  anger: { text: '💢', color: '#d0402a' },
  sneeze: { text: '💨', color: '#7aa0b8' },
  sick: { text: '🤢', color: '#5f9a3a' },
};

const textures = new Map<Key, THREE.Texture>();
/** A speech-bubble texture with one glyph (or topic picture), drawn once per kind. */
function texture(e: Key): THREE.Texture {
  const hit = textures.get(e);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff8ea';
  x.strokeStyle = '#2e2a24';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(32, 28, 22, 0, Math.PI * 2);
  x.moveTo(26, 48);
  x.lineTo(32, 60);
  x.lineTo(38, 48);
  x.fill();
  x.stroke();
  x.fillStyle = '#fff8ea';
  x.fillRect(27, 44, 10, 6);
  if (e.startsWith('t:')) {
    drawTopic(x, e.slice(2) as ChatTopic, 32, 28);
    const t = new THREE.CanvasTexture(c);
    textures.set(e, t);
    return t;
  }
  const g = GLYPH[e as Emote];
  x.font = e === 'sweat' || e === 'anger' || e === 'sneeze' || e === 'sick' ? '26px sans-serif' : 'bold 30px Fredoka, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = g.color;
  x.fillText(g.text, 32, 29);
  const t = new THREE.CanvasTexture(c);
  textures.set(e, t);
  return t;
}

interface Live { sprite: THREE.Sprite; id: ID; emote: Key; age: number; life: number }

/** Billboard emotes (§P2.6): pop in, float, fade. One at a time per goblin; repeats refresh it. */
export class Emotes {
  readonly group = new THREE.Group();
  private live: Live[] = [];
  reducedMotion = false;

  /** A chat line (P5.1): the speaker's bubble shows what the two are talking about. */
  showTopic(id: ID, topic: ChatTopic, life = 2.2): void {
    this.show(id, `t:${topic}`, life);
  }

  show(id: ID, emote: Key, life = 2.4): void {
    const cur = this.live.find((l) => l.id === id);
    if (cur && cur.emote === emote) {
      cur.age = Math.min(cur.age, 0.3);
      return;
    }
    if (cur) this.drop(cur);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(emote), transparent: true, depthWrite: false }));
    sprite.renderOrder = 5;
    this.group.add(sprite);
    this.live.push({ sprite, id, emote, age: 0, life });
  }

  has(id: ID, emote: Key): boolean {
    return this.live.some((l) => l.id === id && l.emote === emote);
  }

  private drop(l: Live): void {
    this.group.remove(l.sprite);
    l.sprite.material.dispose();
    this.live.splice(this.live.indexOf(l), 1);
  }

  /** @param head world position above each goblin's head (null when gone) */
  update(dt: number, head: (id: ID) => THREE.Vector3 | null, camDist = 14): void {
    const k = Math.max(1, camDist / 16);
    for (const l of [...this.live]) {
      l.age += dt;
      const p = head(l.id);
      if (!p || l.age > l.life) {
        this.drop(l);
        continue;
      }
      const pop = this.reducedMotion ? 1 : Math.min(1, l.age / 0.15) * (1 + 0.25 * Math.max(0, 1 - l.age / 0.3));
      const fade = Math.min(1, (l.life - l.age) / 0.4);
      l.sprite.scale.setScalar(0.55 * pop * k);
      l.sprite.material.opacity = fade;
      l.sprite.position.set(p.x, p.y + 0.3 * (k - 1) + (this.reducedMotion ? 0 : l.age * 0.15), p.z);
    }
  }
}
