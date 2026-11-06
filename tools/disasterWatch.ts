/**
 * Phase 6 acceptance for the balance runner (§20.4): natural disasters against the rates the config sets, and how
 * each village recovers from them. The watch books the exposure from the outside (night hours, storm hours, damp
 * dawns, rainy and dry streaks) to get an expected count per kind, and for each disaster compares the population a
 * season later with the population just before it.
 */
import { CFG } from '../src/sim/config';
import { isNight } from '../src/sim/time';
import { dampTimes } from '../src/sim/blight';
import { dist } from '../src/shared/math';
import type { World } from '../src/sim/world';

const D = CFG.disasters, DAY = CFG.time.dayTicks, HOUR = CFG.god.hourTicks, SEASON = CFG.time.daysPerSeason * DAY;
const RAINY = new Set(['rain', 'storm']);
/** the population back to at least this share of what it was before, a season on */
export const RECOVER = 0.7;

export type Kind = 'star' | 'strike' | 'blight' | 'flood' | 'drought';
export const KINDS: Kind[] = ['star', 'strike', 'blight', 'flood', 'drought'];
type Counts = Record<Kind, number>;
const zero = (): Counts => ({ star: 0, strike: 0, blight: 0, flood: 0, drought: 0 });

interface Pending { kind: string; tick: number; pre: number; low: number }

export interface WatchResult {
  observed: Counts; expected: Counts;
  /** disasters whose season has run out, and how many of them the village recovered from */
  judged: number; recovered: number;
  /** the deepest dip below the pre-disaster population in any window (share, 1 = no loss) */
  worst: number;
  misses: string[];
}

export class DisasterWatch {
  private observed = zero();
  private expected = zero();
  private open: Pending[] = [];
  private judged = 0;
  private recovered = 0;
  private worst = 1;
  private misses: string[] = [];
  private rainHours = 0;
  private rainDays = 0;
  private dryDays = 0;
  /** the population at the last few dawns, for "before the disaster" */
  private recent: number[] = [];

  constructor(private w: World) {
    w.bus.subscribe((e) => {
      if (e.type === 'shooting_star') this.hit('star');
      else if (e.type === 'lightning_strike') this.hit('strike');
      else if (e.type === 'flood_started') this.hit('flood');
      else if (e.type === 'drought_started') this.hit('drought');
      else if (e.type === 'blight_started' && this.outbreak(e.plantId)) this.hit('blight');
      else if (e.type === 'fire_started' && (e.cause === 'heat' || e.cause === 'lightning')) this.start(`${e.cause} fire`);
    });
  }

  /** an outbreak is a bush catching it with no blighted bush close enough to have passed it on */
  private outbreak(id: number): boolean {
    const s = this.w.s, p = s.plants.find((x) => x.id === id);
    return !!p && !s.plants.some((o) => o !== p && o.blight > 0 && dist(o.pos, p.pos) <= D.blight.range);
  }

  private hit(k: Kind): void {
    this.observed[k]++;
    // a lightning strike is only a disaster for the village if it starts a fire; the fire_started event follows
    if (k !== 'strike') this.start(k);
  }

  private start(kind: string): void {
    const pre = Math.max(this.w.s.goblins.length, ...this.recent);
    this.open.push({ kind, tick: this.w.s.tick, pre, low: pre });
  }

  /** Call after every step. */
  tick(): void {
    const s = this.w.s, n = s.goblins.length;
    for (const p of this.open) p.low = Math.min(p.low, n);
    for (const p of this.open.filter((x) => s.tick - x.tick >= SEASON)) {
      this.judged++;
      if (n >= RECOVER * p.pre) this.recovered++;
      else this.misses.push(`${p.kind} on day ${Math.floor(p.tick / DAY)}: ${p.pre} → ${n}`);
      this.worst = Math.min(this.worst, p.low / Math.max(1, p.pre));
    }
    this.open = this.open.filter((x) => s.tick - x.tick < SEASON);
    if (s.tick % HOUR !== 0) return;
    const kind = s.weather.kind;
    if (isNight(this.w.clock)) this.expected.star += D.star.perNightHour;
    if (kind === 'storm') this.expected.strike += D.fire.stormStrikesPerHour;
    if (RAINY.has(kind)) this.rainHours++;
    if (s.tick % DAY !== 0) return;
    // a new dawn: book yesterday the way the climate does
    const rainy = this.rainHours >= D.rainyHours, dry = this.rainHours === 0;
    this.rainHours = 0;
    this.rainDays = rainy ? this.rainDays + 1 : 0;
    this.dryDays = dry ? this.dryDays + 1 : 0;
    if (this.rainDays === D.flood.days) this.expected.flood++;
    if (this.w.clock.season === 'summer' && this.dryDays === D.drought.days) this.expected.drought++;
    if (dampTimes(this.w)) this.expected.blight += D.blight.outbreakPerDay;
    this.recent = [...this.recent.slice(-1), n];
  }

  result(): WatchResult {
    return { observed: { ...this.observed }, expected: { ...this.expected }, judged: this.judged, recovered: this.recovered, worst: this.worst, misses: [...this.misses] };
  }
}

/** Observed against expected over all seeds: within a Poisson allowance (2.5 σ, and one either way). */
export function rateCheck(rs: WatchResult[]): { line: string; ok: boolean } {
  let ok = true;
  const parts = KINDS.map((k) => {
    const o = rs.reduce((a, r) => a + r.observed[k], 0), e = rs.reduce((a, r) => a + r.expected[k], 0);
    const fine = Math.abs(o - e) <= 2.5 * Math.sqrt(e) + 1;
    ok &&= fine;
    return `${k} ${o}/${e.toFixed(1)}${fine ? '' : ' ✗'}`;
  });
  return { line: `Disaster rates (observed/expected over all seeds): ${parts.join(', ')} — ${ok ? 'ok' : 'FAIL'}`, ok };
}
