"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { duration, instant, spring, springValue } from "@/lib/motion";
import { MagnifiedEye, Magnifier } from "./Accessory";
import { GAZE_RANGE, useBlink, useGaze } from "./hooks";
import { MoodProps } from "./MoodProps";
import { MOOD_SPECS, layerVariants, type Accessory, type EyeShape, type Mood } from "./moods";
import {
  BODY_PATH,
  BRAND,
  CENTER_X,
  EYE_LEFT_PATH,
  EYE_RIGHT_PATH,
  GROUND_Y,
  STAGE_VIEWBOX,
} from "./paths";
import "./Squiggy.css";

export type SquiggyProps = {
  /** Emotional state. Changes blend smoothly into each other. */
  mood?: Mood;
  /** Rendered width and height (number = px). */
  size?: number | string;
  /** Eyes follow the pointer across the page. */
  followCursor?: boolean;
  /** Let people pick the mascot up and fling it; it springs home. */
  draggable?: boolean;
  /** Makes the mascot a button. Fires on click, tap, Enter or Space. */
  onPoke?: () => void;
  /** Body color. Defaults to Squint blue. */
  color?: string;
  eyeColor?: string;
  /** Strokes drawn over the body, such as the magnifier's rim. Defaults to the eye color. */
  ink?: string;
  /** Something to hold. Moods can bring their own: Searching holds the magnifier. */
  accessory?: Accessory;
  /** Perks up as if hovered, for a parent that owns the hover or focus. */
  perked?: boolean;
  /**
   * Holds the mood's pose (and its props) instead of looping it: for a mascot
   * that stays on screen beside content, where endless motion distracts
   * (WCAG 2.2.2). Blinks still happen.
   */
  still?: boolean;
  /**
   * The root element when the mascot isn't a button: `span` for phrasing
   * contexts, such as inside a button. Looks the same either way.
   */
  as?: "div" | "span";
  /** Accessible name, followed by the mood ("Squiggy, thinking"). */
  label?: string;
  className?: string;
};

const floatVariants = layerVariants("float");
const squashVariants = layerVariants("squash");
const eyesVariants = layerVariants("eyes");
const shadowVariants = layerVariants("shadow");

const BLINK_SCALE = 0.08;
/** Horizontal gaze (SVG units) past which the eyes flip to face that side. */
const FLIP_AT = 5;
type Facing = 1 | -1;
const ground = { originX: 0.5, originY: 1 } as const;

export function Squiggy({
  mood = "idle",
  size = 240,
  followCursor = true,
  draggable = false,
  onPoke,
  color = BRAND.body,
  eyeColor = BRAND.eye,
  ink = eyeColor,
  accessory,
  perked: perkedByParent = false,
  still = false,
  as = "div",
  label = "Squiggy",
  className,
}: SquiggyProps) {
  const reduce = useReducedMotion() ?? false;
  const spec = MOOD_SPECS[mood];
  const rootRef = useRef<HTMLElement>(null);
  const interactive = Boolean(onPoke) || draggable;
  const magnifier = (accessory ?? spec.accessory) === "magnifier";

  const [perked, setPerked] = useState(false);
  const [held, setHeld] = useState(false);
  const [winking, setWinking] = useState(false);
  const dragged = useRef(false);

  // Mood choreography: spring into the pose, then loop it.
  const controls = useAnimationControls();
  useEffect(() => {
    let alive = true;
    void controls.start(`${mood}:enter`).then(() => {
      if (alive && !reduce && !still && spec.loop) void controls.start(`${mood}:loop`);
    });
    return () => {
      alive = false;
    };
    // `held` re-binds the squash and shadow layers to controls when a drag ends.
  }, [mood, reduce, still, held, controls, spec.loop]);

  const blinking = useBlink(spec.blinks && !held);
  const gaze = useGaze(rootRef, {
    follow: followCursor && !reduce,
    override: held ? { x: 0, y: -6 } : spec.gaze,
  });

  // Eyes face the side they look toward. The dead zone keeps them from
  // flickering while the gaze hovers near center.
  const [facing, setFacing] = useState<Facing>(1);
  useMotionValueEvent(gaze.x, "change", (x) => {
    if (x < -FLIP_AT) setFacing(-1);
    else if (x > FLIP_AT) setFacing(1);
  });

  // The body leans a little toward where the eyes look, which reads as depth.
  const leanX = useTransform(gaze.x, [-GAZE_RANGE.x, GAZE_RANGE.x], [-6, 6]);
  const leanRotate = useTransform(gaze.x, [-GAZE_RANGE.x, GAZE_RANGE.x], [-3, 3]);

  // Dangling swing while dragged, driven by horizontal drag velocity.
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const swing = useSpring(
    useTransform(useVelocity(dragX), [-1600, 1600], [-22, 22], { clamp: true }),
    springValue.swing,
  );

  const poke = useAnimationControls();
  const winkTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(winkTimer.current), []);

  const handlePoke = () => {
    if (!reduce) {
      void poke.start({
        scaleX: [1, 1.16, 0.94, 1.03, 1],
        scaleY: [1, 0.84, 1.08, 0.98, 1],
        transition: { duration: 0.5, ease: "easeOut" },
      });
    }
    setWinking(true);
    window.clearTimeout(winkTimer.current);
    winkTimer.current = window.setTimeout(() => setWinking(false), 420);
    onPoke?.();
  };

  const lifted = perked || perkedByParent;
  const eyeBoost = held ? 1.2 : lifted ? 1.06 : 1;
  const Root = (
    interactive ? motion.button : as === "span" ? motion.span : motion.div
  ) as typeof motion.div;

  return (
    <Root
      ref={rootRef as Ref<HTMLDivElement>}
      className={["squint-mascot", className].filter(Boolean).join(" ")}
      data-interactive={interactive || undefined}
      data-draggable={draggable || undefined}
      {...(interactive
        ? { type: "button", "aria-label": `${label}, ${spec.label.toLowerCase()}` }
        : { role: "img", "aria-label": `${label}, ${spec.label.toLowerCase()}` })}
      style={{
        width: size,
        aspectRatio: "1",
        x: dragX,
        y: dragY,
        rotate: draggable && !reduce ? swing : 0,
      }}
      drag={draggable}
      dragSnapToOrigin
      dragElastic={0.4}
      dragTransition={{ bounceStiffness: 320, bounceDamping: 14 }}
      onDragStart={() => {
        dragged.current = true;
        setHeld(true);
      }}
      onDragEnd={() => setHeld(false)}
      onHoverStart={() => interactive && setPerked(true)}
      onHoverEnd={() => setPerked(false)}
      onFocus={() => interactive && setPerked(true)}
      onBlur={() => setPerked(false)}
      onClick={
        interactive
          ? () => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              handlePoke();
            }
          : undefined
      }
    >
      <svg viewBox={STAGE_VIEWBOX} aria-hidden="true" focusable="false">
        <motion.ellipse
          cx={CENTER_X}
          cy={GROUND_Y + 16}
          rx={150}
          ry={13}
          fill={BRAND.ink}
          variants={shadowVariants}
          initial={`${mood}:enter`}
          animate={held ? { scaleX: 0.55, opacity: 0.08 } : controls}
        />

        <motion.g style={{ x: leanX, rotate: reduce ? 0 : leanRotate, ...ground }}>
          <motion.g
            animate={{ y: lifted && !held ? -6 : 0 }}
            transition={reduce ? instant : spring.ui}
          >
            <motion.g
              variants={floatVariants}
              initial={`${mood}:enter`}
              animate={controls}
              style={ground}
            >
              <motion.g
                variants={squashVariants}
                initial={`${mood}:enter`}
                animate={held ? { scaleX: 0.92, scaleY: 1.1 } : controls}
                style={ground}
              >
                <motion.g animate={poke} style={ground}>
                  <motion.path
                    d={BODY_PATH}
                    fill={color}
                    fillRule="evenodd"
                    animate={{ fill: color }}
                  />

                  <motion.g style={{ x: gaze.x, y: gaze.y }}>
                    <motion.g variants={eyesVariants} initial={`${mood}:enter`} animate={controls}>
                      <motion.g
                        animate={{ scale: eyeBoost }}
                        transition={reduce ? instant : spring.ui}
                      >
                        <Eye
                          d={EYE_LEFT_PATH}
                          color={eyeColor}
                          shape={held ? OPEN : spec.leftEye}
                          closed={blinking}
                          facing={facing}
                          reduce={reduce}
                        />
                        <MagnifiedEye active={magnifier} reduce={reduce}>
                          <Eye
                            d={EYE_RIGHT_PATH}
                            color={eyeColor}
                            shape={held ? OPEN : spec.rightEye}
                            closed={blinking || winking}
                            facing={facing}
                            reduce={reduce}
                          />
                        </MagnifiedEye>
                        <AnimatePresence>
                          {magnifier && <Magnifier key="magnifier" ink={ink} reduce={reduce} />}
                        </AnimatePresence>
                      </motion.g>
                    </motion.g>
                  </motion.g>
                </motion.g>
              </motion.g>

              {/* Drawn after the body so badges and props sit in front of it. */}
              <MoodProps mood={mood} color={color} reduce={reduce || still} />
            </motion.g>
          </motion.g>
        </motion.g>
      </svg>
    </Root>
  );
}

const OPEN: EyeShape = { scaleY: 1 };

type EyeProps = {
  d: string;
  color: string;
  shape: EyeShape;
  closed: boolean;
  facing: Facing;
  reduce: boolean;
};

function Eye({ d, color, shape, closed, facing, reduce }: EyeProps) {
  return (
    // Mirrors in place so the quote-mark tail always trails behind the gaze.
    <motion.g animate={{ scaleX: facing }} transition={reduce ? { duration: 0 } : spring.flip}>
      <motion.path
        d={d}
        fill={color}
        animate={{
          scaleX: shape.scaleX ?? 1,
          scaleY: closed ? BLINK_SCALE : shape.scaleY,
          rotate: shape.rotate ?? 0,
        }}
        transition={closed ? { duration: duration.micro / 2.5, ease: "easeIn" } : spring.eye}
      />
    </motion.g>
  );
}
