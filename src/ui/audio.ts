/**
 * The audio engine (§18.14, §24.2): Web Audio buses for effects, voices, ambience and music, the ElevenLabs-made files in
 * public/audio/ (see sound/manifest.ts), a fresh pitch on every play, sounds placed by distance and stereo side from
 * the camera, ambience beds faded in and out, and music crossfaded by occasion. It starts silent until the first
 * click or key (browsers allow sound only then) and a missing file just stays quiet.
 */
import {
  BARKS, LOOPS, MUSIC, SFX, barkFile, loopFile, musicFile, sfxFile,
  type BarkId, type LoopId, type MusicId, type SfxDef, type SfxId, type VoiceId,
} from './sound/manifest';
import type { Vec2 } from '../shared/types';

export type { SfxId as Cue };

export interface AudioPrefs { master: number; sfx: number; voice: number; ambience: number; music: number; muted: boolean }
export const DEFAULT_AUDIO: AudioPrefs = { master: 0.8, sfx: 0.8, voice: 0.8, ambience: 0.6, music: 0.5, muted: false };

/** Where the ear is: the camera's look-at point on the map, how far out it is, and which way it faces. */
export interface Listener { x: number; y: number; dist: number; yaw: number }

export interface PlayOpts {
  /** place the sound on the map; unset plays it flat (UI, the god) */
  at?: Vec2;
  /** pitch multiplier before the random spread (a goblin's own pitch) */
  pitch?: number;
  gain?: number;
}

type Bus = 'sfx' | 'voice' | 'amb' | 'music';
const MUSIC_FADE = 3;
const LOOP_FADE = 1.5;

class Loop {
  src: AudioBufferSourceNode | null = null;
  gain: GainNode;
  target = 0;
  constructor(readonly file: string, ctx: AudioContext, out: AudioNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
  }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  prefs: AudioPrefs = { ...DEFAULT_AUDIO };
  listener: Listener = { x: 0, y: 0, dist: 34, yaw: 0 };
  /** how far a placed sound carries, in tiles, at the default zoom */
  hearing = 26;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private buffers = new Map<string, AudioBuffer | null | Promise<AudioBuffer | null>>();
  private lastPlay = new Map<string, number>();
  private loops = new Map<string, Loop>();
  private music: { id: MusicId; loop: Loop } | null = null;
  private fading: Loop[] = [];
  private live = 0;
  private base = import.meta.env?.BASE_URL ?? './';

  /** Called on the first user gesture: makes the context (or resumes it) and starts loading the common sounds. */
  unlock(): void {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      for (const b of ['sfx', 'voice', 'amb', 'music'] as Bus[]) {
        this.buses[b] = this.ctx.createGain();
        this.buses[b].connect(this.master);
      }
      this.applyPrefs(this.prefs);
      for (const id of Object.keys(SFX) as SfxId[]) for (let v = 0; v < variants(SFX[id]); v++) void this.load(sfxFile(id, v));
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  applyPrefs(p: AudioPrefs): void {
    this.prefs = { ...p };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(p.muted ? 0 : p.master, now, 0.05);
    this.buses.sfx.gain.setTargetAtTime(p.sfx, now, 0.05);
    this.buses.voice.gain.setTargetAtTime(p.voice, now, 0.05);
    this.buses.amb.gain.setTargetAtTime(p.ambience, now, 0.05);
    this.buses.music.gain.setTargetAtTime(p.music, now, 0.05);
  }

  private load(file: string): Promise<AudioBuffer | null> | AudioBuffer | null {
    const have = this.buffers.get(file);
    if (have !== undefined) return have;
    const p = fetch(this.base + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((a) => this.ctx!.decodeAudioData(a))
      .catch(() => null)
      .then((b) => {
        this.buffers.set(file, b);
        return b;
      });
    this.buffers.set(file, p);
    return p;
  }

  /** Gain and stereo side for a sound at `at`, or null when it is out of earshot. */
  place(at: Vec2): { gain: number; pan: number } | null {
    const L = this.listener;
    // zoomed out, the ear takes in more of the map but hears all of it more faintly
    const zoom = Math.max(0.5, L.dist / 34);
    const r = this.hearing * Math.max(1, zoom);
    const dx = at.x - L.x, dy = at.y - L.y;
    const d = Math.hypot(dx, dy);
    if (d > r) return null;
    const near = 1 - d / r;
    const gain = near * near * Math.min(1, 1.2 / zoom);
    // camera right on the map: (cos yaw, −sin yaw)
    const pan = Math.max(-1, Math.min(1, (dx * Math.cos(L.yaw) - dy * Math.sin(L.yaw)) / (r * 0.6)));
    return gain < 0.01 ? null : { gain, pan };
  }

  /** A one-shot effect, each play at a slightly different pitch. */
  play(id: SfxId, o: PlayOpts = {}): void {
    const d: SfxDef = SFX[id];
    if (!this.gate(id, d.gap ?? 60)) return;
    const spread = d.spread ?? 0.08;
    const v = Math.floor(Math.random() * variants(d));
    this.fire(sfxFile(id, v), 'sfx', o, (d.gain ?? 1), 1 + (Math.random() * 2 - 1) * spread);
  }

  /** A goblin's voice: `voice` is which of the four, `pitch` its own (age, size), with a little wobble each time. */
  bark(voice: VoiceId, id: BarkId, o: PlayOpts & { key?: string | number } = {}): void {
    if (!this.gate(`bark:${o.key ?? voice}`, 900)) return;
    const n = BARKS[id].length;
    this.fire(barkFile(voice, id, Math.floor(Math.random() * n)), 'voice', o, 0.9, 1 + (Math.random() * 2 - 1) * 0.04);
  }

  private gate(key: string, gapMs: number): boolean {
    if (!this.ready || this.prefs.muted) return false;
    const now = performance.now();
    if (now - (this.lastPlay.get(key) ?? -Infinity) < gapMs) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private fire(file: string, bus: Bus, o: PlayOpts, base: number, wobble: number): void {
    const ctx = this.ctx!;
    let gain = base * (o.gain ?? 1), pan = 0;
    if (o.at) {
      const p = this.place(o.at);
      if (!p) return;
      gain *= p.gain;
      pan = p.pan;
    }
    if (this.live > 24) return; // a busy village: drop the rest rather than mush
    const go = (buf: AudioBuffer | null) => {
      if (!buf || !this.ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.4, Math.min(2.5, (o.pitch ?? 1) * wobble));
      const g = ctx.createGain();
      g.gain.value = gain;
      let node: AudioNode = src.connect(g);
      if (pan) {
        const sp = ctx.createStereoPanner();
        sp.pan.value = pan;
        node = node.connect(sp);
      }
      node.connect(this.buses[bus]);
      this.live++;
      src.onended = () => { this.live--; g.disconnect(); };
      src.start();
    };
    const b = this.load(file);
    if (b instanceof Promise) void b.then((x) => go(x));
    else go(b);
  }

  /** Fade an ambience bed toward `level` (0 = off). */
  setLoop(id: LoopId, level: number): void {
    if (!this.ctx) return;
    let l = this.loops.get(id);
    if (!l) {
      if (level <= 0.001) return;
      l = new Loop(loopFile(id), this.ctx, this.buses.amb);
      this.loops.set(id, l);
    }
    const want = level * (LOOPS[id].gain ?? 1);
    if (Math.abs(want - l.target) > 0.01 || (want > 0 && !l.src)) this.target(l, want, LOOP_FADE);
  }

  /** Crossfade to a music track (null: silence). */
  setMusic(id: MusicId | null): void {
    if (!this.ctx || this.music?.id === id) return;
    if (this.music) {
      this.target(this.music.loop, 0, MUSIC_FADE);
      this.fading.push(this.music.loop);
      this.music = null;
    }
    if (!id) return;
    const l = new Loop(musicFile(id), this.ctx, this.buses.music);
    this.music = { id, loop: l };
    this.target(l, MUSIC[id].gain ?? 0.9, MUSIC_FADE);
  }

  get musicId(): MusicId | null {
    return this.music?.id ?? null;
  }

  private target(l: Loop, level: number, fade: number): void {
    const ctx = this.ctx!;
    l.target = level;
    l.gain.gain.cancelScheduledValues(ctx.currentTime);
    l.gain.gain.setTargetAtTime(level, ctx.currentTime, fade / 3);
    if (level > 0 && !l.src) {
      const b = this.load(l.file);
      const start = (buf: AudioBuffer | null) => {
        if (!buf || l.src || l.target <= 0 || !this.ctx) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(l.gain);
        // music starts from the top; a bed anywhere in its loop, so two beds never line up
        src.start(0, l.file.includes('/music/') ? 0 : Math.random() * buf.duration);
        l.src = src;
      };
      if (b instanceof Promise) void b.then(start);
      else start(b);
    }
  }

  /** Each frame: stop beds and old music once they have faded out. */
  frame(): void {
    if (!this.ctx) return;
    const done = (l: Loop) => l.target <= 0 && l.gain.gain.value < 0.002;
    for (const [id, l] of this.loops)
      if (done(l) && l.src) {
        l.src.stop();
        l.src = null;
        this.loops.delete(id);
        l.gain.disconnect();
      }
    this.fading = this.fading.filter((l) => {
      if (!done(l)) return true;
      l.src?.stop();
      l.gain.disconnect();
      return false;
    });
  }
}

const variants = (d: SfxDef): number => d.variants ?? 1;

export const audio = new AudioEngine();

if (typeof window !== 'undefined') {
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}
