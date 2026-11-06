import { el } from '../dom';
import { getLang, t } from '../i18n';
import type { Ctx, Component } from '../ctx';
import type { ID, SimEvent, Vec2 } from '../../shared/types';
import { interestOf } from '../../llm/eventCompactor';
import { actorsOf } from '../../llm/eventLog';

interface Cand { score: number; text: string; at: Vec2 | null; id: ID | null; time: number }

const KEEP_MS = 20_000;
/** what is going on, when nothing happened lately: the busier a goblin, the better a shot */
const DULL = new Set(['idle', 'sleep_home', 'sleep_ground', 'rest_sick', 'drink', 'eat', 'struggle']);

/**
 * The Director camera (C, §18.12, P11.1): every 8–15 s it cuts to the most interesting thing going on, scored as the
 * LLM compactor scores a diary line (a death 5, a fight 9, a hatching, a festival, a prayer, a divine act, a chat),
 * newer events counting more; it follows the goblin at its heart and says what is happening in a caption at the
 * bottom. With nothing new it looks in on a goblin busy at something. A manual pan, a click or C again ends it.
 */
export class DirectorCam implements Component {
  on = false;
  private cap = el('div.director-cap.panel.hidden');
  private pool: Cand[] = [];
  private next = 0;
  private following: ID | null = null;
  private shown = '';

  constructor(private ctx: Ctx) {}

  mount(parent: HTMLElement): void {
    parent.append(this.cap);
  }

  toggle(on = !this.on): void {
    this.on = on;
    this.next = 0;
    this.cap.classList.toggle('hidden', !on);
    if (!on) { this.following = null; this.ctx.follow(null); }
    else this.caption(t('director.on'));
  }

  /** Events as they come out of the sim: the candidates for the next cut. */
  onEvents(evs: readonly SimEvent[]): void {
    if (!this.on) return;
    const s = this.ctx.game.world.s, now = performance.now(), lang = getLang();
    for (const e of evs) {
      const i = interestOf(s, e, lang), who = i ? actorsOf(e) : null;
      if (!i || !who || i.score < 3) continue;
      const id = who.find((x) => s.goblins.some((g) => g.id === x)) ?? null;
      const at = e.at ?? (id !== null ? s.goblins.find((g) => g.id === id)?.pos ?? null : null);
      if (id === null && !at) continue;
      this.pool.push({ score: i.score, text: i.text, at: at ? { ...at } : null, id, time: now });
    }
    this.pool = this.pool.filter((c) => now - c.time < KEEP_MS).slice(-60);
  }

  update(): void {}

  frame(): void {
    if (!this.on) return;
    const cam = this.ctx.game.renderer.camera;
    const now = performance.now();
    if (this.following !== null && !this.ctx.game.world.goblin(this.following)) { this.following = null; this.next = now; } // it is gone: cut away
    else if (this.following !== null && cam.followId !== this.following) return this.toggle(false); // the player took the camera
    if (now < this.next) return;
    this.next = now + 8000 + Math.random() * 7000;
    this.cut(now);
  }

  private cut(now: number): void {
    const s = this.ctx.game.world.s;
    // the best of what happened lately: its worth, halved every 10 s
    const best = this.pool.reduce<{ c: Cand; v: number } | null>((b, c) => {
      const v = c.score * 0.5 ** ((now - c.time) / 10_000);
      return !b || v > b.v ? { c, v } : b;
    }, null);
    if (best) {
      this.pool = this.pool.filter((c) => c !== best.c && c.text !== best.c.text);
      return this.show(best.c.id, best.c.at, best.c.text);
    }
    const busy = s.goblins.filter((g) => !DULL.has(g.activity.action) && !g.heldByGod);
    const g = busy.length ? busy[Math.floor(Math.random() * busy.length)]! : s.goblins[Math.floor(Math.random() * s.goblins.length)];
    if (g) this.show(g.id, g.pos, t('director.doing', { name: g.name, act: t(`act.${g.activity.action}`) }));
  }

  private show(id: ID | null, at: Vec2 | null, text: string): void {
    const s = this.ctx.game.world.s;
    if (id !== null && s.goblins.some((g) => g.id === id)) {
      this.ctx.flyTo(s.goblins.find((g) => g.id === id)!.pos);
      this.ctx.follow(id);
      this.following = id;
    } else if (at) {
      this.ctx.flyTo(at);
      this.following = null;
    }
    this.caption(text);
  }

  private caption(text: string): void {
    if (text === this.shown) return;
    this.shown = text;
    this.cap.replaceChildren(el('span.director-tag', { text: '🎬' }), el('span', { text }));
  }
}
