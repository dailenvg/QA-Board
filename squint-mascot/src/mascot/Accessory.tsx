import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { duration, spring } from "../lib/motion";
import { LENS, LENS_GLINT_PATH, LENS_HANDLE_PATH } from "./paths";

/** With no lens in hand the clip grows past the whole stage, so it clips nothing. */
const UNCLIPPED_R = 480;
const away = { opacity: 0, scale: 0.6, rotate: -24 };

/**
 * Wraps the eye behind the lens: while `active` it grows and is cut to the
 * glass, so it reads as magnified. Inactive, it is the plain eye.
 */
export function MagnifiedEye({
  active,
  reduce,
  children,
}: {
  active: boolean;
  reduce: boolean;
  children: ReactNode;
}) {
  const clipId = `squint-lens-${useId().replace(/[^\w-]/g, "")}`;
  const transition = reduce ? { duration: 0 } : spring.ui;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <motion.circle
            cx={LENS.cx}
            cy={LENS.cy}
            initial={false}
            animate={{ r: active ? LENS.r : UNCLIPPED_R }}
            transition={transition}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <motion.g
          initial={false}
          animate={{ scale: active ? LENS.zoom : 1 }}
          transition={transition}
        >
          {children}
        </motion.g>
      </g>
    </>
  );
}

/**
 * A magnifying glass held over the right eye: a tinted lens with a glint,
 * the rim and a handle in `ink`. Pops in and out; reduced motion just shows it.
 */
export function Magnifier({ ink, reduce }: { ink: string; reduce: boolean }) {
  return (
    <motion.g
      initial={reduce ? false : away}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      exit={reduce ? { opacity: 0 } : { ...away, transition: { duration: duration.micro } }}
      transition={reduce ? { duration: 0 } : spring.jelly}
    >
      <path
        d={LENS_HANDLE_PATH}
        stroke={ink}
        strokeWidth={26}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={LENS.cx} cy={LENS.cy} r={LENS.r} fill={LENS.glass} fillOpacity={0.16} />
      <path
        d={LENS_GLINT_PATH}
        stroke={LENS.glass}
        strokeOpacity={0.85}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <circle
        cx={LENS.cx}
        cy={LENS.cy}
        r={LENS.r}
        stroke={ink}
        strokeWidth={LENS.ring}
        fill="none"
      />
    </motion.g>
  );
}
