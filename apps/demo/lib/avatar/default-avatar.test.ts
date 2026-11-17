import { describe, expect, it } from "vitest";
import {
  AVATAR_EDGE,
  AVATAR_FILL,
  AVATAR_GRAYS,
  AVATAR_INK,
  AVATAR_TILE,
  avatarShapes,
  avatarStrokePx,
  avatarSvg,
  drawCompanyBadge,
  drawDefaultAvatar,
  FIGMA_BUBBLE,
  type AvatarDrawing,
  type AvatarFit,
  type AvatarKind,
} from "./default-avatar";

const KINDS: AvatarKind[] = ["person", "company", "workspace", "admin"];
/** One size from each detail step (28 to 36, 40 to 48, 96 and up), and both ends. */
const SIZES = [28, 36, 40, 48, 96, 192];
const FITS: AvatarFit[] = ["free", "circle", "tile"];

/** Every color the system may paint with. */
const GRAYS: string[] = Object.values(AVATAR_GRAYS);

/** What the PNG renderer takes: paths with solid fills and strokes, nothing else. */
const UNSUPPORTED = /var\(|filter|vector-effect|<text|transform|style=|<image|mask|clip|url\(/i;

/** Every color in `markup`'s fill and stroke attributes. */
function paints(markup: string): string[] {
  return [...markup.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** A drawing as one SVG, for the pinned files a reviewer can open. */
function preview(drawing: AvatarDrawing): string {
  return `${avatarSvg(avatarShapes(drawing))}\n`;
}

describe("drawDefaultAvatar", () => {
  it.each(
    KINDS.flatMap((kind) => SIZES.flatMap((size) => FITS.map((fit) => ({ kind, size, fit })))),
  )(
    "draws a $kind at $size px ($fit) in the grays only, with nothing the PNG renderer can't take",
    ({ kind, size, fit }) => {
      const drawing = drawDefaultAvatar({ kind, size, fit, edge: true, tile: AVATAR_TILE });
      const markup = avatarSvg(avatarShapes(drawing));
      expect(markup).not.toMatch(UNSUPPORTED);
      for (const paint of paints(markup)) expect([...GRAYS, "none"]).toContain(paint);
      expect(drawing.edge.length).toBeGreaterThan(0);
      expect(drawing.art[0]?.fill).toBe(AVATAR_FILL);
    },
  );

  it("keeps the Figma bubble's commands, only scaled: body centered, the tail just past the right edge", () => {
    const { art } = drawDefaultAvatar({ kind: "company", size: 40 });
    const bubble = art[0]?.d ?? "";
    const letters = (d: string) => d.replace(/[^A-Za-z]/g, "");
    expect(letters(bubble)).toBe(letters(FIGMA_BUBBLE));
    const xs = [...bubble.matchAll(/[MLC ](-?[\d.]+) -?[\d.]+/g)].map((match) => Number(match[1]));
    expect(Math.min(...xs)).toBeCloseTo(7.25, 1);
    // The body runs 7.25 to 92.75 (centered on 50); the tail tip reaches 100.5, its curve's
    // control point 101.4.
    expect(Math.max(...xs)).toBeGreaterThan(100);
    expect(Math.max(...xs)).toBeLessThan(102);
  });

  it.each(SIZES)(
    "strokes the outline at 4%% of the slot, the edge one stroke beyond: %i px",
    (size) => {
      const { edge, art } = drawDefaultAvatar({ kind: "person", size, edge: true });
      expect(art[0]?.stroke).toBe(AVATAR_INK);
      expect(art[0]?.strokeWidth).toBe(4);
      expect(avatarStrokePx(size)).toBeCloseTo(size * 0.04, 5);
      expect(edge[0]?.fill).toBe(AVATAR_EDGE);
      expect(edge[0]?.strokeWidth).toBe(12);
      // Past the icon where it breaks out of the bubble, the edge is one stroke too.
      expect(edge[1]?.strokeWidth).toBe(8);
    },
  );

  it("scales the stroke with the mark in a circle or a tile", () => {
    expect(
      drawDefaultAvatar({ kind: "company", size: 40, fit: "circle" }).art[0]?.strokeWidth,
    ).toBe(2.96);
    expect(drawDefaultAvatar({ kind: "company", size: 40, fit: "tile" }).art[0]?.strokeWidth).toBe(
      3.4,
    );
    expect(avatarStrokePx(40, "circle")).toBeCloseTo(1.184, 5);
  });

  it.each(KINDS)("draws the %s's icon solid in Gunmetal, with no outline of its own", (kind) => {
    const { art } = drawDefaultAvatar({ kind, size: 96 });
    const icon = art.filter((shape) => shape.fill === AVATAR_INK);
    expect(icon.length).toBeGreaterThan(0);
    for (const shape of icon) expect(shape.stroke).toBeUndefined();
    // Only the bubble carries a stroke.
    expect(art.filter((shape) => shape.stroke)).toHaveLength(1);
  });

  it.each(SIZES)(
    "draws the admin as a shield with a person cut out, the same at every size: %i px",
    (size) => {
      const { art } = drawDefaultAvatar({ kind: "admin", size });
      // The bubble, the shield, then the head and the shoulders cut out of it.
      expect(art.map((shape) => shape.fill)).toEqual([
        AVATAR_FILL,
        AVATAR_INK,
        AVATAR_FILL,
        AVATAR_FILL,
      ]);
    },
  );

  it.each(SIZES)("draws a person as head and shoulders, the same at every size: %i px", (size) => {
    const figure = drawDefaultAvatar({ kind: "person", size, edge: true });
    // The bubble, the head and the shoulders.
    expect(figure.art).toHaveLength(3);
    expect(figure.edge).toHaveLength(3);
    expect(avatarSvg(avatarShapes(figure))).not.toMatch(UNSUPPORTED);
  });

  it("draws a workspace as its company", () => {
    expect(drawDefaultAvatar({ kind: "workspace", size: 96 })).toEqual(
      drawDefaultAvatar({ kind: "company", size: 96 }),
    );
  });

  it("drops detail at each size step", () => {
    const pieces = (kind: AvatarKind, size: number) => drawDefaultAvatar({ kind, size }).art.length;
    // The building: six windows and a door, four and a door, the door alone.
    expect(pieces("company", 96) - pieces("company", 40)).toBe(2);
    expect(pieces("company", 40) - pieces("company", 28)).toBe(4);
  });

  it("puts every kind on the same Pale Steel bubble", () => {
    expect(AVATAR_FILL).toBe(AVATAR_GRAYS.paleSteel);
    for (const kind of KINDS)
      expect(drawDefaultAvatar({ kind, size: 40 }).art[0]?.fill).toBe(AVATAR_FILL);
  });

  it.each([
    ["person-28", { kind: "person", size: 28 }],
    ["person-40-dark", { kind: "person", size: 40, edge: true }],
    ["person-96", { kind: "person", size: 96 }],
    ["company-48", { kind: "company", size: 48 }],
    ["company-96-dark", { kind: "company", size: 96, edge: true }],
    ["company-circle-40", { kind: "company", size: 40, fit: "circle" }],
    ["company-png-192", { kind: "company", size: 192, fit: "tile", tile: AVATAR_TILE }],
    ["admin-36", { kind: "admin", size: 36 }],
    ["admin-192-dark", { kind: "admin", size: 192, edge: true }],
  ] as const)("draws %s as pinned", async (name, options) => {
    await expect(preview(drawDefaultAvatar(options))).toMatchFileSnapshot(
      `__snapshots__/${name}.svg`,
    );
  });
});

describe("drawCompanyBadge", () => {
  it("is a solid ink building on the bubble's gray from 16px, the gray alone under it", () => {
    expect(drawCompanyBadge(14)).toEqual([{ d: "M0 0H100V100H0Z", fill: AVATAR_FILL }]);
    const badge = drawCompanyBadge(18);
    expect(badge).toHaveLength(3);
    expect(badge[0]?.fill).toBe(AVATAR_FILL);
    expect(badge.slice(1).map((shape) => shape.fill)).toEqual([AVATAR_INK, AVATAR_INK]);
    expect(avatarSvg(badge)).not.toMatch(UNSUPPORTED);
  });
});
