import { useEffect, useState, type RefObject } from "react";

/** IntersectionObserver threshold for the entrance: a quarter of the folder on screen. */
const ENTRANCE_THRESHOLD = 0.25;

/**
 * Flips to true the first time the element is on screen (after `delay` ms),
 * which starts the folder's assembly. Without `enabled` it starts entered.
 */
export function useEntrance(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  delay: number,
): boolean {
  const [entered, setEntered] = useState(!enabled);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    let timer = 0;
    const enter = () => {
      timer = window.setTimeout(() => setEntered(true), delay);
    };
    if (typeof IntersectionObserver === "undefined") {
      enter();
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        enter();
      },
      { threshold: ENTRANCE_THRESHOLD },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ref, enabled, delay]);

  return entered;
}

/**
 * Light and parallax follow a mouse or pen across the element, written
 * straight to CSS custom properties: no re-renders. Touch is ignored.
 */
export function usePointerParallax(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    const write = () => {
      frame = 0;
      node.style.setProperty("--gf-px", px.toFixed(3));
      node.style.setProperty("--gf-py", py.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = node.getBoundingClientRect();
      px = ((event.clientX - box.left) / box.width) * 2 - 1;
      py = ((event.clientY - box.top) / box.height) * 2 - 1;
      schedule();
    };
    const leave = () => {
      px = 0;
      py = 0;
      schedule();
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    return () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}
