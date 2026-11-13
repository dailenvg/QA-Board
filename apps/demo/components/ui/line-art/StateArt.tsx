"use client";

import { motion, MotionConfig, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { Squiggy } from "../../brand/mascot/Squiggy";
import type { Mood } from "../../brand/mascot/moods";
import { BRAND } from "../../brand/mascot/paths";
import { dashed, draw, LIME, LINE_SVG, LineBubble, roundedRect, SURFACE } from "./line-art";

/** What's empty, or what went wrong, and so what's drawn. */
export type ArtScene =
  // Empty states.
  | "folder"
  | "noMatch"
  | "archive"
  | "comments"
  | "caughtUp"
  | "resolved"
  | "storage"
  | "workspace"
  // Errors and not-found pages.
  | "notFound"
  | "missingFolder"
  | "missingPage"
  | "brokenLink"
  | "unplugged"
  | "locked"
  | "blocked"
  | "slow"
  | "camera"
  | "brokenImage"
  // Not a state: the Share window's header.
  | "invite";

/** Every scene is drawn on this stage (viewBox units); the box keeps its shape. */
const W = 200;
const H = 140;
const FLOOR = "M16 128H184";
const PANEL = SURFACE;

interface SceneSpec {
  /** Drawn behind Squiggy. */
  back: ReactNode;
  /** Drawn over it, so it can sit inside things (a folder, a box). */
  front?: ReactNode;
  /** Squiggy's stage: its top left and size, in viewBox units. */
  squiggy: { x: number; y: number; size: number };
  /** Squiggy's mood here, unless the caller picks one. */
  mood: Mood;
}

/** "Zz" over a sleeper, the second one smaller and higher. */
function Snores({ x, y }: { x: number; y: number }) {
  return (
    <>
      <motion.path d={`M${x} ${y}h8l-8 8h8`} {...draw(5)} />
      <motion.path d={`M${x + 14} ${y - 12}h6l-6 6h6`} {...draw(6)} />
    </>
  );
}

const SCENES: Record<ArtScene, SceneSpec> = {
  // An invitation on its way: an envelope, a speech bubble flying off it, Squiggy waving it off.
  invite: {
    mood: "happy",
    squiggy: { x: 10, y: 76, size: 50 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d={roundedRect(58, 54, 94, 64, 6)} fill={PANEL} {...draw(0)} />
        <motion.path d="M60 58l45 32 45-32" {...draw(1)} />
        <LineBubble x={134} y={40} w={48} h={28} tail="left" tilt={-10} kind="lines" order={2} />
        <motion.path d="M116 30l8-6M126 40l9-2M106 24l2-9" {...draw(3)} />
        <motion.circle cx={36} cy={36} r={2.5} {...draw(4)} />
        <motion.path d="M184 96v8M180 100h8" {...draw(4)} />
      </>
    ),
  },
  // An empty folder, open, with Squiggy peeking out and a dashed page waiting to go in.
  folder: {
    mood: "idle",
    squiggy: { x: 70, y: 42, size: 60 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path
          d="M44 52h34l8 10h66a6 6 0 0 1 6 6v60H38V58a6 6 0 0 1 6-6Z"
          fill={PANEL}
          {...draw(0)}
        />
        <g transform="rotate(10 150 40)">
          <motion.path d={roundedRect(134, 18, 30, 38, 4)} fill={PANEL} {...dashed(2)} />
        </g>
        <motion.path d="M52 26v8M48 30h8" {...draw(3)} />
        <motion.circle cx={178} cy={70} r={2.5} {...draw(3)} />
      </>
    ),
    front: (
      <>
        <motion.path d="M30 86H170L160 128H40Z" fill={PANEL} {...draw(1)} />
        <motion.path d="M86 106H114" {...draw(2)} />
      </>
    ),
  },
  // Dashed, empty results around a magnifier, Squiggy looking through it.
  noMatch: {
    mood: "thinking",
    squiggy: { x: 72, y: 40, size: 56 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <g transform="rotate(-6 46 54)">
          <motion.path d={roundedRect(20, 40, 52, 28, 6)} {...dashed(1)} />
        </g>
        <g transform="rotate(5 156 44)">
          <motion.path d={roundedRect(130, 30, 52, 28, 6)} {...dashed(2)} />
        </g>
        <motion.path d={roundedRect(132, 94, 46, 24, 6)} {...dashed(3)} />
        <LineBubble x={22} y={88} w={34} h={22} tail="left" tilt={-8} kind="question" order={4} />
      </>
    ),
    front: (
      <>
        <motion.circle cx={100} cy={70} r={32} {...draw(1)} />
        <motion.path d="M80 56a24 24 0 0 1 14-10" {...draw(3)} />
        <motion.path d="M123 93l20 20" strokeWidth={6} {...draw(2)} />
      </>
    ),
  },
  // An open archive box, its lid off and leaning on it, Squiggy asleep inside.
  archive: {
    mood: "sleeping",
    squiggy: { x: 66, y: 30, size: 60 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        {/* The lid, off and leaning on its edge against the box. */}
        <g transform="rotate(14 168 128)">
          <motion.path d={roundedRect(162, 70, 12, 58, 3)} fill={PANEL} {...draw(1)} />
        </g>
        <motion.path d="M44 80H156" {...draw(1)} />
        <Snores x={140} y={34} />
        <motion.circle cx={36} cy={52} r={2.5} {...draw(3)} />
      </>
    ),
    front: (
      <>
        <motion.path d={roundedRect(40, 80, 120, 48, 6)} fill={PANEL} {...draw(1)} />
        <motion.path d={roundedRect(84, 94, 32, 12, 4)} {...draw(2)} />
      </>
    ),
  },
  // A page with no pins yet: a dashed spot and a cursor about to drop the first one.
  comments: {
    mood: "idle",
    squiggy: { x: 132, y: 76, size: 54 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d={roundedRect(26, 18, 122, 100, 10)} fill={PANEL} {...draw(0)} />
        <motion.path d="M26 34H148" {...draw(1)} />
        {[36, 44, 52].map((cx) => (
          <motion.circle key={cx} cx={cx} cy={26} r={2} {...draw(1)} />
        ))}
        <motion.path d="M40 50H104M40 60H86" {...draw(2)} />
        <motion.path d={roundedRect(40, 72, 56, 32, 6)} {...draw(2)} />
        <motion.circle cx={120} cy={62} r={9} {...dashed(3)} />
        <motion.path d="M124 68v17l5-5 4 8 3-1.5-4-8h7Z" fill={PANEL} {...draw(4)} />
      </>
    ),
  },
  // Every comment answered: a neat stack of checked bubbles beside a happy Squiggy.
  caughtUp: {
    mood: "happy",
    squiggy: { x: 106, y: 60, size: 62 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <LineBubble x={26} y={90} w={60} h={26} tail="left" tilt={-3} kind="check" order={1} />
        <LineBubble x={36} y={60} w={52} h={24} tail="right" tilt={4} kind="check" order={2} />
        <LineBubble x={30} y={32} w={46} h={22} tail="left" tilt={-5} kind="check" order={3} />
        <motion.path d="M100 30v8M96 34h8" {...draw(4)} />
        <motion.circle cx={168} cy={42} r={2.5} {...draw(4)} />
        <motion.path d="M150 52l6-6M160 58l8-2" {...draw(5)} />
      </>
    ),
  },
  // Nothing resolved yet: a dashed resolved pin, its check waiting to be earned.
  resolved: {
    mood: "idle",
    squiggy: { x: 112, y: 66, size: 56 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path
          d="M40 112V62a26 26 0 0 1 26-26h4a26 26 0 0 1 26 26v4a26 26 0 0 1-26 26H40Z"
          {...dashed(1)}
        />
        <motion.path d="M54 64l9 9 16-17" {...dashed(2)} />
        <motion.path d="M150 34v8M146 38h8" {...draw(3)} />
        <motion.circle cx={30} cy={34} r={2.5} {...draw(3)} />
      </>
    ),
  },
  // Empty shelves with dashed spots where files will go, Squiggy sitting on the bottom one.
  storage: {
    mood: "idle",
    squiggy: { x: 62, y: 64, size: 50 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M34 28V128M166 28V128M28 28H172" {...draw(0)} />
        <motion.path d="M34 70H166M34 112H166" {...draw(1)} />
        <motion.path d={roundedRect(48, 44, 30, 26, 3)} {...dashed(2)} />
        <motion.path d={roundedRect(88, 50, 22, 20, 3)} {...dashed(2)} />
        <motion.path d={roundedRect(124, 86, 32, 26, 3)} {...dashed(3)} />
        <motion.circle cx={184} cy={50} r={2.5} {...draw(4)} />
      </>
    ),
  },
  // A door left ajar, Squiggy dozing against it, waiting to be let in.
  workspace: {
    mood: "sleeping",
    squiggy: { x: 118, y: 72, size: 54 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M62 128V26H126V128" {...draw(0)} />
        <motion.path d="M62 26L96 34V122L62 128Z" fill={PANEL} {...draw(1)} />
        <motion.circle cx={88} cy={80} r={2.5} {...draw(2)} />
        <motion.path d="M40 128h16M132 128h20" strokeWidth={3} {...draw(2)} />
        <Snores x={158} y={60} />
        <motion.path d="M36 46v8M32 50h8" {...draw(3)} />
      </>
    ),
  },
  // 404: the 0 is a magnifier, Squiggy peering through it.
  notFound: {
    mood: "thinking",
    squiggy: { x: 74, y: 50, size: 52 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M50 116V48L20 94H64" {...draw(1)} />
        <motion.path d="M170 116V48L140 94H184" {...draw(2)} />
        <motion.path d="M100 20v8M96 24h8" {...draw(4)} />
        <motion.circle cx={136} cy={30} r={2.5} {...draw(4)} />
      </>
    ),
    front: (
      <>
        <motion.circle cx={100} cy={78} r={30} {...draw(1)} />
        <motion.path d="M80 64a24 24 0 0 1 14-10" {...draw(3)} />
        <motion.path d="M121 99l14 14" strokeWidth={6} {...draw(2)} />
      </>
    ),
  },
  // A folder that isn't there: its dashed outline, and a question.
  missingFolder: {
    mood: "thinking",
    squiggy: { x: 128, y: 70, size: 56 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M30 62h30l8 10h52a6 6 0 0 1 6 6v50H24V68a6 6 0 0 1 6-6Z" {...dashed(1)} />
        <motion.path d="M18 90H132L124 128H26Z" fill={PANEL} {...dashed(2)} />
        <LineBubble x={82} y={24} w={32} h={22} tail="left" tilt={-6} kind="question" order={3} />
        <motion.circle cx={30} cy={36} r={2.5} {...draw(4)} />
      </>
    ),
  },
  // A project that isn't there: a dashed page, and a question.
  missingPage: {
    mood: "thinking",
    squiggy: { x: 126, y: 70, size: 56 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d={roundedRect(34, 30, 80, 98, 8)} {...dashed(1)} />
        <motion.path d="M48 50H96M48 60H82" {...dashed(2)} />
        <motion.path d={roundedRect(48, 72, 46, 30, 5)} {...dashed(2)} />
        <LineBubble x={96} y={16} w={32} h={22} tail="left" tilt={6} kind="question" order={3} />
        <motion.path d="M24 22v8M20 26h8" {...draw(4)} />
      </>
    ),
  },
  // A link that doesn't open: a chain link snapped in two.
  brokenLink: {
    mood: "thinking",
    squiggy: { x: 132, y: 78, size: 50 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <g transform="rotate(-18 60 56)">
          <motion.path d="M84 44H48a14 14 0 0 0 0 28H72" {...draw(1)} />
          <motion.path d="M56 58H76" {...draw(2)} />
        </g>
        <g transform="rotate(-18 140 44)">
          <motion.path d="M116 32H152a14 14 0 0 1 0 28H128" {...draw(1)} />
          <motion.path d="M124 46H144" {...draw(2)} />
        </g>
        <motion.path d="M92 52l6 4M100 40l2 8M104 62l6-2" {...draw(3)} />
        <motion.circle cx={34} cy={100} r={2.5} {...draw(4)} />
      </>
    ),
  },
  // Can't reach the server: a plug pulled from its socket.
  unplugged: {
    mood: "surprised",
    squiggy: { x: 22, y: 74, size: 50 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M176 18V128" {...draw(0)} />
        <motion.path d={roundedRect(154, 52, 22, 32, 4)} fill={PANEL} {...draw(1)} />
        <motion.path d="M162 62v6M168 62v6" {...draw(2)} />
        <motion.path d="M98 66C72 66 86 116 58 116H16" {...draw(1)} />
        <motion.path d={roundedRect(98, 54, 26, 24, 5)} fill={PANEL} {...draw(2)} />
        <motion.path d="M124 60h9M124 72h9" {...draw(3)} />
        <motion.path d="M140 48l4-6M142 66h6M140 84l4 6" {...draw(4)} />
      </>
    ),
  },
  // Signed out: a padlock, its key on the floor.
  locked: {
    mood: "surprised",
    squiggy: { x: 128, y: 76, size: 52 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M78 64V50a20 20 0 0 1 40 0v14" {...draw(1)} />
        <motion.path d={roundedRect(64, 64, 68, 52, 8)} fill={PANEL} {...draw(1)} />
        <motion.circle cx={98} cy={84} r={5} {...draw(2)} />
        <motion.path d="M98 89v10" {...draw(2)} />
        <motion.circle cx={28} cy={120} r={6} {...draw(3)} />
        <motion.path d="M34 120H54M48 120v4M52 120v4" {...draw(3)} />
        <motion.path d="M150 30v8M146 34h8" {...draw(4)} />
      </>
    ),
  },
  // A site that won't be shown here: a browser window with a no-entry sign.
  blocked: {
    mood: "surprised",
    squiggy: { x: 134, y: 76, size: 50 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d={roundedRect(26, 20, 116, 96, 10)} fill={PANEL} {...draw(0)} />
        <motion.path d="M26 36H142" {...draw(1)} />
        {[36, 44, 52].map((cx) => (
          <motion.circle key={cx} cx={cx} cy={28} r={2} {...draw(1)} />
        ))}
        <motion.circle cx={84} cy={76} r={24} {...draw(2)} />
        <motion.path d="M67 93L101 59" {...draw(3)} />
        <motion.circle cx={176} cy={40} r={2.5} {...draw(4)} />
      </>
    ),
  },
  // A site taking its time: an hourglass, half run through.
  slow: {
    mood: "thinking",
    squiggy: { x: 120, y: 74, size: 52 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M52 22H112M52 126H112" strokeWidth={3} {...draw(1)} />
        <motion.path
          d="M60 22C60 52 98 58 98 74S60 96 60 126M104 22C104 52 66 58 66 74S104 96 104 126"
          {...draw(1)}
        />
        <motion.path d="M70 40H94M82 74v10M66 120C72 108 92 108 98 120" {...draw(2)} />
        <motion.path d="M150 34v8M146 38h8" {...draw(4)} />
        <motion.circle cx={30} cy={60} r={2.5} {...draw(4)} />
      </>
    ),
  },
  // A snapshot that didn't come out: a camera, its lens cracked.
  camera: {
    mood: "surprised",
    squiggy: { x: 134, y: 76, size: 50 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <motion.path d="M60 50l6-10h28l6 10" {...draw(1)} />
        <motion.path d={roundedRect(30, 50, 104, 66, 10)} fill={PANEL} {...draw(0)} />
        <motion.circle cx={82} cy={83} r={22} {...draw(1)} />
        <motion.circle cx={82} cy={83} r={12} {...draw(2)} />
        <motion.path d="M74 70l6 8-5 5 9 9" {...draw(3)} />
        <motion.path d={roundedRect(112, 58, 12, 7, 2)} {...draw(2)} />
        <motion.path d="M140 30l6-8M150 42l10-2M128 22l-2-8" {...draw(4)} />
      </>
    ),
  },
  // An image that won't show: a picture torn in two.
  brokenImage: {
    mood: "surprised",
    squiggy: { x: 136, y: 80, size: 46 },
    back: (
      <>
        <motion.path d={FLOOR} {...draw(0)} />
        <g transform="rotate(-6 60 70)">
          <motion.path d="M26 28H90L82 48L94 64L84 84L92 112H26Z" fill={PANEL} {...draw(1)} />
          <motion.path d="M34 100L54 76L70 92" {...draw(2)} />
        </g>
        <g transform="rotate(5 140 70)">
          <motion.path d="M106 28H170V112H108L100 84L110 64L98 48Z" fill={PANEL} {...draw(1)} />
          <motion.circle cx={150} cy={46} r={7} {...draw(2)} />
          <motion.path d="M106 96L126 70L146 92" {...draw(2)} />
        </g>
        <motion.path d="M24 18v8M20 22h8" {...draw(4)} />
      </>
    ),
  },
};

/** What the art sits on: its filled shapes take this color, so they read as unfilled. */
export type ArtSurface = "panel" | "tile" | "card";

/** Widths per size: a page's empty state, a panel's, or a tile's. */
const SIZE = { lg: "w-60", md: "w-44", sm: "w-28" } as const;

interface StateArtProps {
  scene: ArtScene;
  /** Squiggy's mood, when the place it's in has a better one than the scene's own. */
  mood?: Mood;
  size?: keyof typeof SIZE;
  /** Squiggy holds its mood's pose instead of looping it (beside content: WCAG 2.2.2). */
  still?: boolean;
  surface?: ArtSurface;
  className?: string;
}

/**
 * An empty or error state's picture in Squint's line art: the scene's grey lines draw
 * themselves in on the surface it sits on, and a live Squiggy in lime, the one filled shape,
 * sits in it (inside a folder or a box, where the scene has one). Decorative: the state says
 * it in words. With reduced motion the lines are simply there.
 */
export function StateArt({
  scene,
  mood,
  size = "lg",
  still = false,
  surface = "panel",
  className = "",
}: StateArtProps) {
  const reduce = useReducedMotion() ?? false;
  const spec = SCENES[scene];
  const { x, y, size: squiggySize } = spec.squiggy;
  const place: CSSProperties = {
    left: `${(x / W) * 100}%`,
    top: `${(y / H) * 100}%`,
    width: `${(squiggySize / W) * 100}%`,
  };
  const layer = `absolute inset-0 size-full ${LINE_SVG.className}`;
  return (
    <MotionConfig skipAnimations={reduce}>
      <span
        aria-hidden="true"
        data-testid="state-art"
        data-scene={scene}
        className={`relative block aspect-[10/7] shrink-0 ${SIZE[size]} ${className}`}
        style={{ "--art-surface": `var(--color-${surface})` } as CSSProperties}
      >
        <svg viewBox={`0 0 ${W} ${H}`} {...LINE_SVG} className={layer}>
          {spec.back}
        </svg>
        <span className="absolute block aspect-square" style={place}>
          <Squiggy
            mood={mood ?? spec.mood}
            size="100%"
            color={LIME}
            eyeColor={BRAND.ink}
            outline="var(--color-scene-ink)"
            followCursor={false}
            still={still}
            as="span"
          />
        </span>
        {spec.front ? (
          <svg viewBox={`0 0 ${W} ${H}`} {...LINE_SVG} className={layer}>
            {spec.front}
          </svg>
        ) : null}
      </span>
    </MotionConfig>
  );
}
