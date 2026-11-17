import { describe, expect, it } from "vitest";
import { COMMENTER_PALETTE, NATIVE_PET_PALETTE, PAPER } from "../brand-palette";
import { contrast } from "../color";
import {
  ADMIN_FILL,
  AVATAR_EDGE,
  AVATAR_INK,
  AVATAR_TILE,
  avatarInkOn,
  avatarShapes,
  avatarSvg,
  companyFill,
  COMPANY_DEFAULT_FILL,
  drawCompanyBadge,
  drawDefaultAvatar,
  FIGMA_BUBBLE,
  personFill,
  WORKSPACE_FILL,
  type AvatarDrawing,
  type AvatarFit,
  type AvatarKind,
} from "./default-avatar";

const KINDS: AvatarKind[] = ["person", "company", "workspace", "admin"];
/** One size from each detail step (28 to 36, 40 to 48, 96 and up), and both ends. */
const SIZES = [28, 36, 40, 48, 96, 192];
const FITS: AvatarFit[] = ["free", "circle", "tile"];

/** Colors a bubble can take: every pin color, the kinds' own, and brand colors light to dark. */
const FILLS = [
  ...NATIVE_PET_PALETTE.map((entry) => entry.hex),
  COMPANY_DEFAULT_FILL,
  ADMIN_FILL,
  WORKSPACE_FILL,
  "#0f766e",
  "#c2410c",
  "#012d61",
  "#777777",
  "#000000",
  "#ffffff",
];

/** What the PNG renderer takes: paths with solid fills and strokes, nothing else. */
const UNSUPPORTED = /var\(|filter|vector-effect|<text|transform|style=|<image|mask|clip|url\(/i;

/** Every color in `markup`'s fill and stroke attributes. */
function paints(markup: string): string[] {
  return [...markup.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** A drawing as one SVG, with its initials as text, for the pinned files a reviewer can open. */
function preview(drawing: AvatarDrawing): string {
  const svg = avatarSvg(avatarShapes(drawing));
  const text = drawing.initials;
  if (!text) return `${svg}\n`;
  const label =
    `<text x="${text.x}" y="${text.y}" font-size="${text.fontSize}" font-weight="${text.fontWeight}" ` +
    `letter-spacing="${text.letterSpacing}" fill="${text.fill}" text-anchor="middle" ` +
    `dominant-baseline="central" font-family="Figtree, sans-serif">${text.text}</text>`;
  return `${svg.replace("</svg>", `${label}</svg>`)}\n`;
}

describe("drawDefaultAvatar", () => {
  it.each(
    KINDS.flatMap((kind) => SIZES.flatMap((size) => FITS.map((fit) => ({ kind, size, fit })))),
  )(
    "draws a $kind at $size px ($fit) with literal colors and nothing the PNG renderer can't take",
    ({ kind, size, fit }) => {
      const drawing = drawDefaultAvatar({
        kind,
        fill: "#0f766e",
        size,
        fit,
        edge: true,
        tile: AVATAR_TILE,
        initials: "AL",
      });
      const markup = avatarSvg(avatarShapes(drawing));
      expect(markup).not.toMatch(UNSUPPORTED);
      for (const paint of paints(markup)) expect(paint).toMatch(/^(#[0-9a-f]{6}|none)$/i);
      expect(drawing.edge.length).toBeGreaterThan(0);
      expect(drawing.initials !== null).toBe(kind === "person");
    },
  );

  it("keeps the Figma bubble's commands, only scaled: body centered, the tail just past the right edge", () => {
    const { art } = drawDefaultAvatar({ kind: "company", fill: COMPANY_DEFAULT_FILL, size: 40 });
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

  it("weighs the outline at Figma's ratio from 96px, and holds it at 1.5px from 48px down", () => {
    const outline = (size: number) => {
      const bubble = drawDefaultAvatar({ kind: "person", fill: "#feb651", size }).art[0];
      return ((bubble?.strokeWidth ?? 0) * size) / 100;
    };
    expect(outline(192)).toBeCloseTo(4.99, 1);
    expect(outline(96)).toBeCloseTo(2.5, 1);
    expect(outline(48)).toBeCloseTo(1.5, 1);
    expect(outline(28)).toBeCloseTo(1.5, 1);
  });

  it("draws the light edge only when asked: 1.5px to 48px, 2px at 96, 3px at 192", () => {
    expect(drawDefaultAvatar({ kind: "person", fill: "#feb651", size: 40 }).edge).toEqual([]);
    const halo = (size: number) => {
      const { edge, art } = drawDefaultAvatar({
        kind: "person",
        fill: "#feb651",
        size,
        edge: true,
      });
      expect(edge[0]?.fill).toBe(AVATAR_EDGE);
      return (((edge[0]?.strokeWidth ?? 0) - (art[0]?.strokeWidth ?? 0)) * size) / 200;
    };
    expect(halo(40)).toBeCloseTo(1.5, 1);
    expect(halo(96)).toBeCloseTo(2, 1);
    expect(halo(192)).toBeCloseTo(3, 1);
  });

  it.each(SIZES)(
    "draws a person as initials under a head, or head and shoulders without them, at %i px",
    (size) => {
      const options = {
        kind: "person",
        fill: personFill("Ana Lima"),
        size,
        initials: "AL",
      } as const;
      const initialed = drawDefaultAvatar(options);
      expect(initialed.initials?.text).toBe("AL");
      // The bubble, then the head.
      expect(initialed.art).toHaveLength(2);
      const figure = drawDefaultAvatar({ ...options, silhouette: true, edge: true });
      expect(figure.initials).toBeNull();
      // The bubble, the head and the shoulders, the same at every size.
      expect(figure.art).toHaveLength(3);
      expect(figure.edge).toHaveLength(3);
      expect(avatarSvg(avatarShapes(figure))).not.toMatch(UNSUPPORTED);
    },
  );

  it("drops detail at each size step", () => {
    const pieces = (kind: AvatarKind, size: number) =>
      drawDefaultAvatar({ kind, fill: "#feb651", size }).art.length;
    // The building: six windows and a door, four and a door, the door alone.
    expect(pieces("company", 96) - pieces("company", 40)).toBe(2);
    expect(pieces("company", 40) - pieces("company", 28)).toBe(4);
    // The card loses its sun, then a line and its hills.
    expect(pieces("workspace", 96) - pieces("workspace", 48)).toBe(1);
    expect(pieces("workspace", 48) - pieces("workspace", 36)).toBe(2);
    // The shield keeps its check down to 40px.
    expect(pieces("admin", 40) - pieces("admin", 36)).toBe(1);
  });

  it.each(FILLS)("keeps the icon at 3:1 or more on %s", (fill) => {
    const ink = avatarInkOn(fill);
    expect(contrast(fill, ink)).toBeGreaterThanOrEqual(3);
    const { art } = drawDefaultAvatar({ kind: "company", fill, size: 96 });
    const building = art[1];
    expect(building?.fill).toBe(ink);
    // On a dark fill the paper icon takes the ink outline, so it reads off the bubble.
    expect(building?.stroke).toBe(ink === PAPER ? AVATAR_INK : undefined);
  });

  it.each(COMMENTER_PALETTE.map((entry) => entry.hex))(
    "sets a person's initials at 4.5:1 or more on %s",
    (fill) => {
      const { initials } = drawDefaultAvatar({ kind: "person", fill, size: 28, initials: "MW" });
      expect(initials?.fill).toBe(AVATAR_INK);
      // Figtree is loaded 400 to 700: asking for more would render 700 anyway.
      expect(initials?.fontWeight).toBe(700);
      expect(contrast(fill, initials?.fill ?? fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    [
      "person-ana-lima-28",
      { kind: "person", fill: personFill("Ana Lima"), size: 28, initials: "AL" },
    ],
    [
      "person-kenji-ito-40-dark",
      { kind: "person", fill: personFill("Kenji Ito"), size: 40, initials: "KI", edge: true },
    ],
    [
      "person-mia-reyes-96",
      { kind: "person", fill: personFill("Mia Reyes"), size: 96, initials: "MR" },
    ],
    [
      "person-badged-28",
      { kind: "person", fill: personFill("Ana Lima"), size: 28, silhouette: true },
    ],
    [
      "person-badged-40-dark",
      { kind: "person", fill: personFill("Kenji Ito"), size: 40, silhouette: true, edge: true },
    ],
    ["company-default-48", { kind: "company", fill: companyFill(null), size: 48 }],
    [
      "company-teal-96-dark",
      { kind: "company", fill: companyFill("#0f766e"), size: 96, edge: true },
    ],
    [
      "company-circle-40",
      { kind: "company", fill: companyFill("#c2410c"), size: 40, fit: "circle" },
    ],
    [
      "company-png-192",
      { kind: "company", fill: companyFill(null), size: 192, fit: "tile", tile: AVATAR_TILE },
    ],
    ["workspace-96", { kind: "workspace", fill: WORKSPACE_FILL, size: 96 }],
    ["admin-36", { kind: "admin", fill: ADMIN_FILL, size: 36 }],
    ["admin-192-dark", { kind: "admin", fill: ADMIN_FILL, size: 192, edge: true }],
  ] as const)("draws %s as pinned", async (name, options) => {
    await expect(preview(drawDefaultAvatar(options))).toMatchFileSnapshot(
      `__snapshots__/${name}.svg`,
    );
  });
});

describe("drawCompanyBadge", () => {
  it("is a solid building on the company's color from 16px, the color alone under it", () => {
    expect(drawCompanyBadge("#0f766e", 14)).toEqual([{ d: "M0 0H100V100H0Z", fill: "#0f766e" }]);
    const badge = drawCompanyBadge("#0f766e", 18);
    expect(badge).toHaveLength(3);
    expect(badge.slice(1).map((shape) => shape.fill)).toEqual([PAPER, PAPER]);
    expect(
      drawCompanyBadge(WORKSPACE_FILL, 16)
        .slice(1)
        .map((shape) => shape.fill),
    ).toEqual([AVATAR_INK, AVATAR_INK]);
    expect(avatarSvg(badge)).not.toMatch(UNSUPPORTED);
  });
});

describe("fills", () => {
  it("gives a person their pin color, whatever the case and spacing of their name", () => {
    expect(personFill("  ana   LIMA ")).toBe(personFill("Ana Lima"));
    expect(COMMENTER_PALETTE.map((entry) => entry.hex)).toContain(personFill("Ana Lima"));
  });

  it("gives a company its brand color, or magenta without one", () => {
    expect(companyFill("#0f766e")).toBe("#0f766e");
    expect(companyFill(null)).toBe("#E03B9D");
  });
});
