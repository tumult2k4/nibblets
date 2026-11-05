export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Round to a fixed number of decimals; keeps saved state compact and stable. */
export const roundTo = (v: number, decimals: number): number => {
  const m = 10 ** decimals;
  return Math.round(v * m) / m;
};
export const q2 = (v: number): number => roundTo(v, 2);
export const q4 = (v: number): number => roundTo(v, 4);

/** Wrap hue to [0, 360). */
export const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/** Average two hues on the circle along the shortest arc. */
export const hueMean = (a: number, b: number): number => {
  let d = wrapHue(b) - wrapHue(a);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return wrapHue(wrapHue(a) + d / 2);
};

/** Signed shortest angular difference b - a in degrees. */
export const hueDelta = (a: number, b: number): number => {
  let d = wrapHue(b) - wrapHue(a);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** HSL (h degrees, s/l 0..1) → RGB 0..1. */
export function hslToRgb(c: HSL): [number, number, number] {
  const h = wrapHue(c.h) / 360;
  const { s, l } = c;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export const hslCss = (c: HSL): string =>
  `hsl(${Math.round(wrapHue(c.h))} ${Math.round(c.s * 100)}% ${Math.round(c.l * 100)}%)`;
