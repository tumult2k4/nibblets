import { el } from '../dom';
import { t } from '../i18n';
import type { App } from '../app';
import { clockAt } from '../../sim/time';

/**
 * Photo mode (F12, §18.12, P11.2): every bit of UI hidden, time frozen, the camera freer (closer, lower), a soft
 * vignette and a tilt-shift toggle, and a PNG of the view. A small bar at the bottom holds the controls and fades
 * when the mouse is still; it is DOM, so it is never in the picture. Esc or F12 again leaves.
 */
export class PhotoBar {
  private root = el('div.photo-bar.panel.hidden');
  private speed = 1;
  private idle = 0;

  constructor(private app: App) {
    document.body.append(this.root);
    window.addEventListener('pointermove', () => { this.idle = 0; this.root.classList.remove('faded'); });
  }

  get on(): boolean {
    return this.app.game.renderer.photo.on;
  }

  toggle(): void {
    const r = this.app.game.renderer, on = !r.photo.on;
    r.photo.on = on;
    r.camera.setFree(on);
    document.body.classList.toggle('photo-mode', on);
    this.root.classList.toggle('hidden', !on);
    if (on) {
      this.speed = this.app.game.speedIdx;
      this.app.game.speedIdx = 0; // time stands still for the picture
      r.camera.followId = null;
      this.render();
    } else {
      this.app.game.speedIdx = this.speed;
      r.photo.release();
    }
  }

  private render(): void {
    const look = this.app.game.renderer.photo.look;
    const slider = (key: 'vignette' | 'focus', min: number, max: number) => {
      const i = el('input', { type: 'range', min: String(min), max: String(max), step: '0.05', value: String(look[key]), 'aria-label': t(`photo.${key}`) }) as HTMLInputElement;
      i.oninput = () => (look[key] = Number(i.value));
      i.onchange = () => i.blur(); // so F12 and Esc reach the game again
      return el('label.photo-ctl', {}, el('span', { text: t(`photo.${key}`) }), i);
    };
    const tilt = el(`button.btn${look.tilt ? '.on' : ''}`, { text: t('photo.tilt'), 'data-tip': t('photo.tiltTip'),
      onclick: () => { look.tilt = !look.tilt; tilt.classList.toggle('on', look.tilt); focus.classList.toggle('dim', !look.tilt); } });
    const focus = slider('focus', 0.15, 0.85);
    focus.classList.toggle('dim', !look.tilt);
    this.root.replaceChildren(
      el('b', { text: `📷 ${t('photo.title')}` }), tilt, focus, slider('vignette', 0, 1),
      el('button.btn.primary', { text: t('photo.save'), onclick: (e: Event) => this.save(e.currentTarget as HTMLButtonElement) }),
      el('button.btn', { text: t('photo.exit'), 'data-tip': 'Esc', onclick: () => this.toggle() }),
      el('span.sub', { text: t('photo.hint') }));
  }

  /** The view as a PNG ("nibblets-day12-0830.png"): the frame as last drawn (the drawing buffer is kept). */
  private save(btn?: HTMLButtonElement): void {
    const g = this.app.game, c = clockAt(g.world.s.tick), hh = Math.floor(c.hour), mm = Math.floor((c.hour - hh) * 60);
    if (btn) { btn.disabled = true; btn.textContent = t('photo.saving'); } // encoding a big PNG takes a moment
    g.renderer.gl.domElement.toBlob((b) => {
      if (btn) { btn.disabled = false; btn.textContent = t('photo.save'); }
      if (!b) return;
      const a = el('a', { href: URL.createObjectURL(b), download: `nibblets-day${c.day + 1}-${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}.png` }) as HTMLAnchorElement;
      document.body.append(a); // (a detached link is not always followed)
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.root.classList.add('flash');
      setTimeout(() => this.root.classList.remove('flash'), 300);
    }, 'image/png');
  }

  /** Each frame: the bar fades after a few still seconds. */
  frame(dt: number): void {
    if (!this.on) return;
    this.idle += dt;
    if (this.idle > 2.5) this.root.classList.add('faded');
  }
}
