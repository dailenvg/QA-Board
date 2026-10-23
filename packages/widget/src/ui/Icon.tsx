import { createElement } from "react";

type IconNode =
  | readonly ["path", { d: string }]
  | readonly ["circle", { cx: number; cy: number; r: number }]
  | readonly ["line", { x1: number; y1: number; x2: number; y2: number }];

/** Lucide icon geometry (ISC licensed), 24px grid, 2px stroke. */
const ICONS = {
  message: [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
  eye: [
    [
      "path",
      {
        d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      },
    ],
    ["circle", { cx: 12, cy: 12, r: 3 }],
  ],
  eyeOff: [
    [
      "path",
      {
        d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
      },
    ],
    ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
    [
      "path",
      {
        d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
      },
    ],
    ["path", { d: "m2 2 20 20" }],
  ],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  checkCircle: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  branch: [
    ["line", { x1: 6, y1: 3, x2: 6, y2: 15 }],
    ["circle", { cx: 18, cy: 6, r: 3 }],
    ["circle", { cx: 6, cy: 18, r: 3 }],
    ["path", { d: "M18 9a9 9 0 0 1-9 9" }],
  ],
  help: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }],
    ["path", { d: "M12 17h.01" }],
  ],
  close: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
  ],
  retry: [
    ["path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }],
    ["path", { d: "M21 3v5h-5" }],
  ],
  alert: [
    ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
} satisfies Record<string, readonly IconNode[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
}

/** Decorative icon; pair it with visible text or an aria-label on the control. */
export function Icon({ name }: IconProps) {
  return (
    <svg className="pp-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(ICONS[name] as readonly IconNode[]).map(([tag, attributes], index) =>
        createElement(tag, { key: index, ...attributes }),
      )}
    </svg>
  );
}
