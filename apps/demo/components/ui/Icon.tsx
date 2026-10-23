import { createElement } from "react";

type IconNode = readonly [string, Readonly<Record<string, string | number>>];

/** Lucide icon geometry (ISC licensed): 24px grid, 1.75px stroke, one set site-wide. */
const ICONS = {
  arrowRight: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "m12 5 7 7-7 7" }],
  ],
  github: [
    [
      "path",
      {
        d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
      },
    ],
    ["path", { d: "M9 18c-4.51 2-5-2-7-2" }],
  ],
  pointer: [
    ["path", { d: "M14 4.1 12 6" }],
    ["path", { d: "m5.1 8-2.9-.8" }],
    ["path", { d: "m6 12-1.9 2" }],
    ["path", { d: "M7.2 2.2 8 5.1" }],
    [
      "path",
      {
        d: "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
      },
    ],
  ],
  pullRequest: [
    ["circle", { cx: 18, cy: 18, r: 3 }],
    ["circle", { cx: 6, cy: 6, r: 3 }],
    ["path", { d: "M13 6h3a2 2 0 0 1 2 2v7" }],
    ["line", { x1: 6, y1: 9, x2: 6, y2: 21 }],
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
  ],
  layers: [
    [
      "path",
      {
        d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
      },
    ],
    ["path", { d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" }],
    ["path", { d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" }],
  ],
  anchor: [
    ["path", { d: "M12 22V8" }],
    ["path", { d: "M5 12H2a10 10 0 0 0 20 0h-3" }],
    ["circle", { cx: 12, cy: 5, r: 3 }],
  ],
  camera: [
    [
      "path",
      {
        d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
      },
    ],
    ["circle", { cx: 12, cy: 13, r: 3 }],
  ],
  keyboard: [
    ["rect", { x: 2, y: 4, width: 20, height: 16, rx: 2 }],
    ["path", { d: "M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" }],
  ],
  database: [
    ["ellipse", { cx: 12, cy: 5, rx: 9, ry: 3 }],
    ["path", { d: "M3 5V19A9 3 0 0 0 21 19V5" }],
    ["path", { d: "M3 12A9 3 0 0 0 21 12" }],
  ],
  shield: [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
    ],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  plus: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "M12 5v14" }],
  ],
  menu: [["path", { d: "M4 6h16M4 12h16M4 18h16" }]],
  close: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  copy: [
    ["rect", { x: 8, y: 8, width: 14, height: 14, rx: 2 }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
  ],
  alert: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "M12 8v4M12 16h.01" }],
  ],
  external: [
    ["path", { d: "M15 3h6v6" }],
    ["path", { d: "M10 14 21 3" }],
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
  ],
  pin: [
    [
      "path",
      {
        d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
      },
    ],
    ["circle", { cx: 12, cy: 10, r: 3 }],
  ],
} satisfies Record<string, readonly IconNode[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  className?: string;
}

/** Decorative icon. Pair it with visible text or an aria-label on the control. */
export function Icon({ name, className = "size-5" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {(ICONS[name] as readonly IconNode[]).map(([tag, attributes], index) =>
        createElement(tag, { key: index, ...attributes }),
      )}
    </svg>
  );
}
