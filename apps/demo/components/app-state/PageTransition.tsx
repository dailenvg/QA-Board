"use client";

import { motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { duration, ease } from "@/lib/motion";

/**
 * Flips after the first client mount. The server never runs effects, so the
 * server render (and the hydrating client render) always see `false`.
 */
let hasMounted = false;

/** True while an enclosing transition is still playing its entrance. */
const EnteringContext = createContext(false);

/**
 * Route entrance for client-side navigations: the new route fades and rises
 * in. The first load renders without an initial state, so server-rendered
 * content is visible immediately and without JavaScript.
 *
 * Templates nest (the root one, and the workspace one inside the persistent
 * sidebar layout). A nested transition that mounts while its parent is still
 * entering stays put, so a route never fades in twice.
 *
 * Entrance only, by design: App Router unmounts the old route as soon as the
 * new one renders, so an AnimatePresence exit would need Next's internal
 * LayoutRouterContext (a "frozen router") or delaying every navigation behind
 * an exit animation. Both are fragile across Next releases; persistent UI
 * (the sidebar's active indicator, segmented thumbs) carries continuity via
 * `layoutId` instead.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  /** Layout for the wrapper, so the route's content can sit in its parent's flex flow. */
  className?: string;
}) {
  const reduce = useReducedMotion();
  const parentEntering = useContext(EnteringContext);
  const [animateEntry] = useState(() => hasMounted && !parentEntering);
  const [entering, setEntering] = useState(animateEntry);

  useEffect(() => {
    hasMounted = true;
  }, []);

  return (
    <EnteringContext.Provider value={parentEntering || entering}>
      <motion.div
        className={className}
        initial={animateEntry ? { opacity: 0, y: reduce ? 0 : 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? duration.micro : duration.page, ease: ease.out }}
        onAnimationComplete={() => setEntering(false)}
      >
        {children}
      </motion.div>
    </EnteringContext.Provider>
  );
}
