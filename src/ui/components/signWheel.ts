/**
 * The Sign wheel (§17.7.1, P8.9): a radial menu of the wishes in three rings (work, safety, spirit) round a tone
 * selector. A wish that needs a target asks for it: gather what, build what (sub-rings), come or keep away where (a
 * click in the world). The choice goes out as a `divine_speech` sign; no language model needed.
 */
import { el } from '../dom';
import { tipKey } from './tooltip';
import { t } from '../i18n';
import type { ParsedIntent, Tone, WishIntent, BuildingType, ItemType } from '../../shared/types';

export const INTENT_GLYPH: Record<WishIntent, string> = {
  gather: '🧺', build: '🔨', plant: '🌱', tend: '💧', teach: '📜', explore: '🧭',
  guard: '🛡', fight: '⚔', hide: '🏠', avoid: '🚫', stop: '✋', rest: '💤', come_here: '📍', eat: '🍎',
  share_food: '🤲', make_peace: '🕊', worship: '🙏', celebrate: '🎉', court: '♥', move_home: '🏡', leave_alone: '🙅',
};
const RINGS: [string, WishIntent[]][] = [
  ['sign.work', ['gather', 'build', 'plant', 'tend', 'teach', 'explore']],
  ['sign.safety', ['guard', 'fight', 'hide', 'avoid', 'stop', 'rest', 'come_here', 'eat']],
  ['sign.spirit', ['share_food', 'make_peace', 'worship', 'celebrate', 'court', 'move_home', 'leave_alone']],
];
const GATHER: [ItemType, string][] = [['wood', '🪵'], ['stone', '🪨'], ['fiber', '🌾'], ['apple', '🍎'], ['berry', '🫐'], ['mushroom', '🍄'], ['fish', '🐟'], ['clay', '🟫'], ['flint', '🔷'], ['meat', '🍖']];
const TONE_GLYPH: Record<Tone, string> = { kind: '☺', stern: '☝', wrathful: '⚡', playful: '✿' };
const SPOT: readonly WishIntent[] = ['come_here', 'avoid'];

export interface WheelHost {
  send(intents: ParsedIntent[], tone: Tone): void;
  pickSpot(intent: WishIntent, tone: Tone): void;
  buildings(): BuildingType[];
}

export class SignWheel {
  readonly root = el('div.signwheel.hidden');
  private tone: Tone = 'kind';
  private sub: 'gather' | 'build' | null = null;
  private label = '';
  private cost = '';

  constructor(private host: WheelHost) {}

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }
  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(label: string, cost: string): void {
    this.label = label;
    this.cost = cost;
    this.sub = null;
    this.render();
    this.root.classList.remove('hidden');
  }
  close(): void {
    this.root.classList.add('hidden');
  }

  private button(glyph: string, tip: string, r: number, a: number, onclick: () => void): HTMLElement {
    const b = el('button.btn.sw-btn', { onclick, style: `left:calc(50% + ${Math.round(Math.cos(a) * r)}px);top:calc(50% + ${Math.round(Math.sin(a) * r)}px)` }, glyph);
    b.dataset.tip = tip;
    return b;
  }

  private choose(intent: WishIntent): void {
    if (intent === 'gather' || intent === 'build') { this.sub = intent; return this.render(); }
    if (SPOT.includes(intent)) { this.close(); return this.host.pickSpot(intent, this.tone); }
    this.close();
    this.host.send([{ intent }], this.tone);
  }

  private render(): void {
    const kids: HTMLElement[] = [];
    const ring = (n: number, i: number) => -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2; // half a step round, clear of the ring's name
    if (!this.sub) {
      RINGS.forEach(([name, xs], k) => {
        const r = 92 + k * 62;
        kids.push(el('div.sw-ring', { style: `width:${2 * r}px;height:${2 * r}px` }, el('span.sw-ringname', { text: t(name) })));
        xs.forEach((x, i) => kids.push(this.button(INTENT_GLYPH[x], t(`intent.${x}`), r, ring(xs.length, i), () => this.choose(x))));
      });
    } else {
      const done = (target?: ParsedIntent['target']) => { this.close(); this.host.send([{ intent: this.sub!, ...(target ? { target } : {}) }], this.tone); };
      const opts: [string, string, () => void][] = this.sub === 'gather'
        ? [['✱', t('sign.anything'), () => done()], ...GATHER.map(([it, g]) => [g, t(`item.${it}`), () => done({ kind: 'item', value: it })] as [string, string, () => void])]
        : [['✱', t('sign.waiting'), () => done()], ...this.host.buildings().slice(0, 13).map((b) => ['🏗', t(`bld.${b}`), () => done({ kind: 'building', value: b })] as [string, string, () => void])];
      const r = 120;
      kids.push(el('div.sw-ring', { style: `width:${2 * r}px;height:${2 * r}px` })); // the question sits in the middle
      opts.forEach(([g, tip, f], i) => {
        const b = this.button(g, tip, r, ring(opts.length, i), f);
        if (this.sub === 'build') b.append(el('span.sw-cap', { text: tip }));
        kids.push(b);
      });
      kids.push(this.button('↩', t('sign.back'), 190, Math.PI / 2, () => { this.sub = null; this.render(); }));
    }
    const tones = el('div.sw-tones', {}, ...(['kind', 'stern', 'wrathful', 'playful'] as Tone[]).map((tn) => {
      const b = el(`button.btn${tn === this.tone ? '.on' : ''}`, { onclick: () => { this.tone = tn; this.render(); } }, TONE_GLYPH[tn]);
      b.dataset.tip = t(`tone.${tn}`);
      return b;
    }));
    const ask = this.sub ? [el('b', { text: t(this.sub === 'gather' ? 'sign.what' : 'sign.buildWhat') })] : [];
    const center = el('div.sw-center', {}, ...ask, el('div', { text: this.label }), el('div.sub', { text: this.cost }), tones,
      el('button.btn', { 'data-tip': tipKey(t('insp.close'), 'Esc'), onclick: () => this.close(), style: 'margin-top:4px' }, '✕'));
    this.root.replaceChildren(el('div.sw-disc', {}, ...kids, center));
  }
}
