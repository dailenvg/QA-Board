import { useEffect, useState, type RefObject } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { springValue } from "../lib/motion";

/** How far the eyes can travel inside the body, in SVG units. */
export const GAZE_RANGE = { x: 22, y: 16 };

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Natural, irregular blinking. Occasionally double-blinks. */
export function useBlink(enabled: boolean) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setClosed(false);
      return;
    }
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(blink, delay);
    };
    const blink = () => {
      setClosed(true);
      timer = window.setTimeout(() => {
        setClosed(false);
        schedule(Math.random() < 0.18 ? 160 : between(2400, 5200));
      }, 110);
    };
    schedule(between(1200, 3200));
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return closed;
}

type GazeOptions = {
  follow: boolean;
  override: { x: number; y: number } | null;
};

/**
 * Eyes track the pointer anywhere on the page, relative to the mascot's center.
 * After a few seconds without input the mascot glances around on its own.
 */
export function useGaze(ref: RefObject<HTMLElement>, { follow, override }: GazeOptions) {
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, springValue.gaze);
  const y = useSpring(targetY, springValue.gaze);

  const overrideX = override?.x;
  const overrideY = override?.y;

  useEffect(() => {
    const look = (nx: number, ny: number) => {
      targetX.set(nx * GAZE_RANGE.x);
      targetY.set(ny * GAZE_RANGE.y);
    };

    if (overrideX !== undefined && overrideY !== undefined) {
      targetX.set(overrideX);
      targetY.set(overrideY);
      return;
    }
    if (!follow) {
      look(0, 0);
      return;
    }

    let lastInput = performance.now();
    let wanderTimer = 0;

    const onPointer = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      // Full deflection once the pointer is a little over one mascot-width away.
      const reach = Math.min(dist / (r.width * 1.2), 1);
      look((dx / dist) * reach, (dy / dist) * reach);
      lastInput = performance.now();
    };
    const onLeave = () => look(0, 0);
    const wander = () => {
      if (performance.now() - lastInput > 4000) {
        look(between(-0.7, 0.7), between(-0.6, 0.6));
      }
      wanderTimer = window.setTimeout(wander, between(1800, 3600));
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    wanderTimer = window.setTimeout(wander, 4000);

    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.clearTimeout(wanderTimer);
    };
  }, [follow, overrideX, overrideY, ref, targetX, targetY]);

  return { x, y };
}
