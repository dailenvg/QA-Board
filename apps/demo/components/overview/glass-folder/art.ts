/**
 * Generated folder artwork: a domain-warped noise field shaded as a liquid
 * surface. Pure and DOM-free, so it can run anywhere and be tested on its own.
 */

import { hexToRgb } from "@/lib/color";

export interface ArtRecipe {
  /** Unique per recipe; part of the paint cache key. */
  name: string;
  /** `marble` folds the colors through each other; `streak` pulls them into a long exposure. */
  style: "marble" | "streak";
  /** Two or more colors, in the order they appear through the field. */
  colors: readonly string[];
  /** Size of the forms. Lower is larger and calmer. */
  scale?: number;
  /** How hard the field folds into itself. */
  warp?: number;
  /** Direction of the flow, in radians. */
  angle?: number;
  /** Specular highlight on the liquid surface, 0 to 1. */
  gloss?: number;
  /** Veins along the folds, 0 to 1. */
  veins?: number;
  /** The veins' color, like printed line art. Without it they simply darken. */
  veinColor?: string;
}

export interface ArtJob {
  width: number;
  height: number;
  /** RGBA, ready for `new ImageData(pixels, width, height)`. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
  /** Does up to `rows` more rows of work. Returns true once the picture is finished. */
  step: (rows: number) => boolean;
}

/** A small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable unsigned 32-bit hash (FNV-1a), so art and jitter follow an id. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Where a file sits in the fan: -1 to 1 across the visible stack, 0 for one file. */
export function fanSlot(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * 2 - 1;
}

/** Typed-array read; every index in this module is in bounds by construction. */
const at = (array: Float32Array | Uint8Array, index: number): number => array[index] ?? 0;

/** Seeded gradient noise, summed into fractal octaves with a rotation between each. */
function makeFbm(seed: number): (x: number, y: number, octaves: number) => number {
  const random = rng(seed);
  const perm = new Uint8Array(512);
  const grad = new Float32Array(512);
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = at(p, i);
    p[i] = at(p, j);
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = at(p, i & 255);
  for (let i = 0; i < 256; i++) {
    const a = random() * Math.PI * 2;
    grad[i * 2] = Math.cos(a);
    grad[i * 2 + 1] = Math.sin(a);
  }
  const noise = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const h00 = at(perm, X + at(perm, Y)) * 2;
    const h10 = at(perm, X + 1 + at(perm, Y)) * 2;
    const h01 = at(perm, X + at(perm, Y + 1)) * 2;
    const h11 = at(perm, X + 1 + at(perm, Y + 1)) * 2;
    const d00 = at(grad, h00) * xf + at(grad, h00 + 1) * yf;
    const d10 = at(grad, h10) * (xf - 1) + at(grad, h10 + 1) * yf;
    const d01 = at(grad, h01) * xf + at(grad, h01 + 1) * (yf - 1);
    const d11 = at(grad, h11) * (xf - 1) + at(grad, h11 + 1) * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    return d00 + u * (d10 - d00) + v * (d01 - d00 + u * (d11 - d01 - d10 + d00));
  };
  return (x, y, octaves) => {
    let sum = 0;
    let amp = 0.5;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x, y);
      const nx = 1.6 * x + 1.2 * y + 7.1;
      y = -1.2 * x + 1.6 * y + 3.3;
      x = nx;
      amp *= 0.5;
    }
    return sum;
  };
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Colorized pixel rows per grid row of work: shading is much cheaper than sampling the field. */
const SHADE_ROWS_PER_STEP = 4;

/**
 * The artwork, as a job that can be spread over many frames.
 *
 * A field is domain-warped twice (each fold feeding the next), then
 * normalized by its own percentiles so every seed spans the whole palette.
 * The field is then treated as the height of a liquid surface: its slope
 * gives a normal, the normal gives diffuse light and a tight specular, and
 * fine striations run along the contours like combed ink. `streak` squeezes
 * the coordinates along one axis first, which turns the same folds into a
 * long-exposure smear.
 *
 * Work happens in three phases (field rows, upsampling, shaded rows), each
 * resumable, so no single step blocks a frame for long.
 */
export function createArtJob(
  width: number,
  height: number,
  recipe: ArtRecipe,
  seed: number,
): ArtJob {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const colors = recipe.colors.length >= 2 ? recipe.colors : ["#111111", "#eeeeee"];
  const stops = colors.map((color, i) => ({ t: i / (colors.length - 1), c: hexToRgb(color) }));
  const scale = recipe.scale ?? 0.7;
  const warp = recipe.warp ?? 3;
  const gloss = recipe.gloss ?? 0.4;
  const veins = recipe.veins ?? 0;
  const veinInk = recipe.veinColor ? hexToRgb(recipe.veinColor) : null;
  const streak = recipe.style === "streak";
  const fbm = makeFbm(seed * 977 + 13);
  const random = rng(seed + 1);
  const ox = random() * 50;
  const oy = random() * 50;
  const angle = (recipe.angle ?? 0) + (random() - 0.5) * 0.5;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const m = Math.min(w, h);
  // The field is sampled on a half-resolution grid (with a one-cell apron) and
  // brought up with Catmull-Rom, which keeps the slope continuous for the
  // lighting: a quarter of the noise for no visible loss.
  const gw = Math.ceil(w / 2) + 3;
  const gh = Math.ceil(h / 2) + 3;
  const G = new Float32Array(gw * gh);
  const GQ = new Float32Array(gw * gh);
  const F = new Float32Array(w * h);
  const Q = new Float32Array(w * h);
  const pixels = new Uint8ClampedArray(w * h * 4);
  let fieldRow = 0;
  let shadeRow = 0;
  let shading: ((y: number) => void) | null = null;

  const field = (gy: number) => {
    for (let gx = 0; gx < gw; gx++) {
      const u = ((gx - 1) * 2 - w / 2) / m;
      const v = ((gy - 1) * 2 - h / 2) / m;
      let px = (u * ca - v * sa) * scale;
      let py = (u * sa + v * ca) * scale;
      if (streak) {
        px *= 0.14;
        py *= 2.2;
      }
      px += ox;
      py += oy;
      const qx = fbm(px, py, 3);
      const qy = fbm(px + 5.2, py + 1.3, 3);
      const rx = fbm(px + warp * qx + 1.7, py + warp * qy + 9.2, 3);
      const ry = fbm(px + warp * qx + 8.3, py + warp * qy + 2.8, 3);
      G[gy * gw + gx] = fbm(px + warp * rx, py + warp * ry, 4);
      GQ[gy * gw + gx] = Math.sqrt(qx * qx + qy * qy);
    }
  };

  const upsample = () => {
    // Pixel x sits on grid column x/2 + 1: either exactly on a sample, or halfway.
    const cr = (a: number, b: number, c: number, d: number) => (-a + 9 * b + 9 * c - d) / 16;
    const T = new Float32Array(w * gh);
    for (let gy = 0; gy < gh; gy++) {
      const r = gy * gw;
      for (let x = 0; x < w; x++) {
        const c = (x >> 1) + 1;
        T[gy * w + x] =
          x & 1
            ? cr(at(G, r + c - 1), at(G, r + c), at(G, r + c + 1), at(G, r + c + 2))
            : at(G, r + c);
      }
    }
    for (let y = 0; y < h; y++) {
      const c = (y >> 1) + 1;
      for (let x = 0; x < w; x++) {
        F[y * w + x] =
          y & 1
            ? cr(
                at(T, (c - 1) * w + x),
                at(T, c * w + x),
                at(T, (c + 1) * w + x),
                at(T, (c + 2) * w + x),
              )
            : at(T, c * w + x);
        const gx = (x >> 1) + 1;
        const q0 = at(GQ, c * gw + gx);
        const qx = x & 1 ? (q0 + at(GQ, c * gw + gx + 1)) / 2 : q0;
        const below = (c + 1) * gw + gx;
        const q1 = y & 1 ? (x & 1 ? (at(GQ, below) + at(GQ, below + 1)) / 2 : at(GQ, below)) : qx;
        Q[y * w + x] = (qx + q1) / 2;
      }
    }
  };

  /** Percentiles from a sample, not a full sort: cheap and just as stable. Returns a row shader. */
  const prepareShading = (): ((y: number) => void) => {
    const sample: number[] = [];
    const stride = Math.max(1, Math.floor(F.length / 4096));
    for (let i = 0; i < F.length; i += stride) sample.push(at(F, i));
    sample.sort((a, b) => a - b);
    const lo = sample[Math.floor(sample.length * 0.02)] ?? 0;
    const hi = sample[Math.floor(sample.length * 0.98)] ?? 1;
    const k = 1 / (hi - lo || 1);
    const lx = -0.55;
    const ly = -0.65;
    const lz = 0.52;
    const slope = k * m * 0.012;
    return (y) => {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = clamp01((at(F, i) - lo) * k);
        let j = 1;
        while (j < stops.length - 1 && (stops[j]?.t ?? 1) < t) j++;
        const a = stops[j - 1] ?? stops[0];
        const b = stops[j] ?? a;
        if (!a || !b) continue;
        let f = clamp01((t - a.t) / (b.t - a.t || 1));
        f = f * f * (3 - 2 * f);
        const gx = (at(F, x < w - 1 ? i + 1 : i) - at(F, x > 0 ? i - 1 : i)) * slope;
        const gy = (at(F, y < h - 1 ? i + w : i) - at(F, y > 0 ? i - w : i)) * slope;
        const nd = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1);
        const spec = Math.pow(nd > 0 ? nd : 0, 24) * gloss * 255;
        const q = at(Q, i);
        const silk = 1 + 0.035 * Math.sin(t * 150 + q * 24);
        const vein = veins * Math.max(0, 1 - Math.abs(q - 0.42) * 14) * 0.6;
        // Colored veins replace the base color; plain ones only take light away.
        const inked = veinInk ? Math.min(1, vein * 1.6) : 0;
        const lit = (0.82 + 0.28 * nd) * silk * (veinInk ? 1 : 1 - vein);
        for (let ch = 0; ch < 3; ch++) {
          const base = (a.c[ch] ?? 0) + ((b.c[ch] ?? 0) - (a.c[ch] ?? 0)) * f;
          const ink = veinInk ? base + ((veinInk[ch] ?? 0) - base) * inked : base;
          pixels[i * 4 + ch] = ink * lit + spec;
        }
        pixels[i * 4 + 3] = 255;
      }
    };
  };

  const step = (rows: number): boolean => {
    const budget = Math.max(1, rows);
    if (fieldRow < gh) {
      const end = Math.min(gh, fieldRow + budget);
      while (fieldRow < end) field(fieldRow++);
      return false;
    }
    if (!shading) {
      upsample();
      shading = prepareShading();
      return false;
    }
    const end = Math.min(h, shadeRow + budget * SHADE_ROWS_PER_STEP);
    while (shadeRow < end) shading(shadeRow++);
    return shadeRow >= h;
  };

  return { width: w, height: h, pixels, step };
}
