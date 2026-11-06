/**
 * A tiny canvas chart helper for the stats panel (P7.6, no chart library): line charts (optionally as steps) and
 * 100 % stacked bands, over a shared x axis in days, with a light grid, the y range at the left and the days below.
 */
export interface Line { label: string; color: string; values: number[] }
export interface Band { color: string; values: number[] }
export interface ChartOpts { width: number; height: number; step?: boolean; yMax?: number; unit?: string }

const INK = '#5d5446', GRID = 'rgba(107, 79, 58, 0.18)', PAD = { l: 26, r: 6, t: 6, b: 16 };

/** A canvas sized for the device's pixel ratio, drawing in CSS pixels. */
export function chartCanvas(width: number, height: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const r = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(width * r);
  cv.height = Math.round(height * r);
  cv.style.width = `${width}px`;
  cv.style.height = `${height}px`;
  cv.getContext('2d')?.scale(r, r);
  return cv;
}

/** A round number at or above `v` for the top of the y axis (1, 2, 5 × 10ⁿ). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((k) => k * p >= v) ?? 10) * p;
}

function frame(ctx: CanvasRenderingContext2D, o: ChartOpts, days: number[], yMax: number): { x: (i: number) => number; y: (v: number) => number } {
  const w = o.width - PAD.l - PAD.r, h = o.height - PAD.t - PAD.b;
  const d0 = days[0] ?? 0, d1 = Math.max(d0 + 1e-6, days[days.length - 1] ?? 1);
  ctx.clearRect(0, 0, o.width, o.height);
  ctx.font = '10px Fredoka, system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let k = 0; k <= 2; k++) {
    const y = PAD.t + (h * k) / 2;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y + 0.5);
    ctx.lineTo(PAD.l + w, y + 0.5);
    ctx.stroke();
  }
  ctx.textAlign = 'right';
  ctx.fillText(`${+(yMax).toFixed(1)}${o.unit ?? ''}`, PAD.l - 3, PAD.t + 8);
  ctx.fillText('0', PAD.l - 3, PAD.t + h);
  ctx.textAlign = 'left';
  ctx.fillText(`d${Math.floor(d0)}`, PAD.l, o.height - 3);
  ctx.textAlign = 'right';
  ctx.fillText(`d${Math.floor(d1)}`, PAD.l + w, o.height - 3);
  return {
    x: (i: number) => PAD.l + ((days[i]! - d0) / (d1 - d0)) * w,
    y: (v: number) => PAD.t + h - (Math.max(0, Math.min(yMax, v)) / yMax) * h,
  };
}

/** Lines over `days` (all series the same length as `days`). */
export function drawLines(cv: HTMLCanvasElement, days: number[], lines: Line[], o: ChartOpts): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const yMax = o.yMax ?? niceMax(Math.max(1, ...lines.flatMap((l) => l.values)));
  const f = frame(ctx, o, days, yMax);
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  for (const l of lines) {
    ctx.strokeStyle = l.color;
    ctx.beginPath();
    l.values.forEach((v, i) => {
      if (i === 0) ctx.moveTo(f.x(i), f.y(v));
      else {
        if (o.step) ctx.lineTo(f.x(i), f.y(l.values[i - 1]!));
        ctx.lineTo(f.x(i), f.y(v));
      }
    });
    ctx.stroke();
  }
}

/** Bands stacked to 100 % at each point (shares 0..1 that sum to 1, or 0 where there is nothing). */
export function drawStack(cv: HTMLCanvasElement, days: number[], bands: Band[], o: ChartOpts): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const f = frame(ctx, { ...o, unit: '%' }, days, 100);
  const base = days.map(() => 0);
  for (const b of bands) {
    if (!b.values.some((v) => v > 0)) continue;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    days.forEach((_, i) => (i ? ctx.lineTo(f.x(i), f.y((base[i]! + b.values[i]!) * 100)) : ctx.moveTo(f.x(i), f.y((base[i]! + b.values[i]!) * 100))));
    for (let i = days.length - 1; i >= 0; i--) ctx.lineTo(f.x(i), f.y(base[i]! * 100));
    ctx.closePath();
    ctx.fill();
    days.forEach((_, i) => (base[i]! += b.values[i]!));
  }
}
