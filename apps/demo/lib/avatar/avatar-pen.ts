/**
 * The geometry under the default avatars: a pen maps design coordinates onto
 * the final 0 to 100 box, so scaling and fitting are baked into the numbers.
 * No transform and no `vector-effect`, which the PNG renderer can't take.
 * Every map is a uniform scale plus a move, so H and V stay H and V.
 */

export type Point = readonly [number, number];
export type PointMap = (x: number, y: number) => Point;

export interface Pen {
  map: PointMap;
  /** How many box units one design unit becomes. */
  k: number;
}

/** Two decimals: plenty at 192px, and the markup stays short. */
export function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A pen that applies `maps` in order. */
export function pen(maps: readonly PointMap[]): Pen {
  const map: PointMap = (x, y) => maps.reduce<Point>((point, step) => step(...point), [x, y]);
  const [ax, ay] = map(0, 0);
  const [bx, by] = map(1, 0);
  return { map, k: Math.hypot(bx - ax, by - ay) };
}

/** Icon paths use absolute M, L, C, Q and Z with "x,y" pairs, so each pair maps on its own. */
const PAIR = /(-?\d*\.?\d+),(-?\d*\.?\d+)/g;

export function mapPairs(p: Pen, d: string): string {
  return d.replace(PAIR, (_, x: string, y: string) => {
    const [mx, my] = p.map(Number(x), Number(y));
    return `${r2(mx)},${r2(my)}`;
  });
}

const TOKEN = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g;

/**
 * A Figma export's path (absolute M, L, C, H, V and Z, space separated): the
 * same points, through `p`. Anything else is refused rather than misdrawn.
 */
export function mapFigmaPath(p: Pen, d: string): string {
  const tokens = d.match(TOKEN) ?? [];
  let index = 0;
  const next = () => Number(tokens[index++]);
  const parts: string[] = [];
  let command = "";
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
      parts.push(command);
      if (command === "Z") continue;
    }
    if (command === "H") parts.push(`${r2(p.map(next(), 0)[0])} `);
    else if (command === "V") parts.push(`${r2(p.map(0, next())[1])} `);
    else if (command === "M" || command === "L" || command === "C") {
      const [x, y] = p.map(next(), next());
      parts.push(`${r2(x)} ${r2(y)} `);
    } else throw new Error(`Unsupported path command ${command}`);
  }
  return parts
    .join("")
    .replace(/ ([A-Z])/g, "$1")
    .trim();
}

/** A circle as two arcs, centered on (`cx`, `cy`) in design units. */
export function circlePath(p: Pen, cx: number, cy: number, r: number): string {
  const [x, y] = p.map(cx, cy);
  const R = r2(r * p.k);
  const arc = `A${R} ${R} 0 1 0`;
  return `M${r2(x - R)} ${r2(y)}${arc} ${r2(x + R)} ${r2(y)}${arc} ${r2(x - R)} ${r2(y)}Z`;
}

/** A rounded rectangle from its top left corner, in design units. */
export function roundedRect(p: Pen, x: number, y: number, w: number, h: number, r: number): string {
  const [X, Y] = p.map(x, y);
  const W = w * p.k;
  const H = h * p.k;
  const R = Math.min(r * p.k, W / 2, H / 2);
  const x1 = X + W;
  const y1 = Y + H;
  const arc = `A${r2(R)} ${r2(R)} 0 0 1`;
  return (
    `M${r2(X + R)} ${r2(Y)}L${r2(x1 - R)} ${r2(Y)}${arc} ${r2(x1)} ${r2(Y + R)}` +
    `L${r2(x1)} ${r2(y1 - R)}${arc} ${r2(x1 - R)} ${r2(y1)}` +
    `L${r2(X + R)} ${r2(y1)}${arc} ${r2(X)} ${r2(y1 - R)}` +
    `L${r2(X)} ${r2(Y + R)}${arc} ${r2(X + R)} ${r2(Y)}Z`
  );
}
