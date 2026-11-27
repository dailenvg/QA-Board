"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { zoomLabel, zoomStepDown, zoomStepUp, type Zoom } from "./stage-zoom";
import { zoomMenuItems } from "./zoom-menu";

interface ZoomControlProps {
  /** Off on a live website's frame, and while the stage has no surface to zoom. */
  shown: boolean;
  zoom: Zoom;
  /** The level shown now (`StageZoom.effective`); null until it's measured. */
  effective: number | null;
  /** The level a zoom asked for landed on (`StageZoom.announced`), the only one announced. */
  announced: number | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (zoom: Zoom) => void;
}

const LEVEL_TRIGGER =
  "flex h-11 min-w-16 items-center justify-center rounded-pill px-2 text-body font-semibold text-ink tabular-nums transition-colors hover:bg-hover active:bg-seg aria-expanded:bg-hover";

/** What the level button and its menu are called: "Zoom, fit width" or "Zoom, 200%". */
function levelName(zoom: Zoom): string {
  return `Zoom, ${zoom === "fit" ? "fit width" : zoomLabel(zoom)}`;
}

/**
 * What screen readers hear once a zoom lands: "Fit width, 46%" or "Zoom 200%". Naming Fit means
 * a move between Fit and the same level (a small image fits at 100%) is still heard.
 */
function statusLine(zoom: Zoom, announced: number | null): string {
  if (announced === null) return "";
  const percent = `${Math.round(announced * 100)}%`;
  return zoom === "fit" ? `Fit width, ${percent}` : `Zoom ${percent}`;
}

/**
 * Zoom out, the level (a menu of Fit width and set levels) and Zoom in, floating at the bottom
 * right of the stage. At 25% and 400% the button that would pass the limit is unavailable, but
 * keeps focus. Screen readers hear each level a zoom lands on, not a Fit that moves with the
 * window or the page.
 */
export function ZoomControl({
  shown,
  zoom,
  effective,
  announced,
  onZoomIn,
  onZoomOut,
  onZoomTo,
}: ZoomControlProps) {
  const variants = usePopVariants();
  const canZoomIn = effective !== null && zoomStepUp(effective) !== null;
  const canZoomOut = effective !== null && zoomStepDown(effective) !== null;

  return (
    <AnimatePresence>
      {shown ? (
        <motion.div
          key="zoom-control"
          role="group"
          aria-label="Zoom"
          data-testid="zoom-control"
          // A button here focused by a click doesn't take Space: Space-drag does (`useSpacePan`).
          data-zoom-control=""
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: "bottom right" }}
          // In from the stage's edges by its gutter (the content's padding, the snapshot bar's
          // margin), which also keeps it off a classic scrollbar. Stages leave room under it.
          className="absolute right-3 bottom-3 z-30 flex items-center gap-1 rounded-pill bg-panel/95 p-1 shadow-float ring-1 ring-line backdrop-blur sm:right-5 sm:bottom-5"
        >
          {/* aria-disabled, not disabled: at a limit the button keeps keyboard focus. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            title="Zoom out (-)"
            aria-disabled={!canZoomOut || undefined}
            data-testid="zoom-out"
            onClick={canZoomOut ? onZoomOut : undefined}
          >
            <Icon name="zoomOut" />
          </Button>
          <Menu
            label={levelName(zoom)}
            items={zoomMenuItems(zoom, onZoomTo)}
            icon={null}
            text={zoomLabel(zoom)}
            textClassName=""
            triggerClassName={LEVEL_TRIGGER}
            placement="above"
            testId="zoom-level"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            title="Zoom in (+)"
            aria-disabled={!canZoomIn || undefined}
            data-testid="zoom-in"
            onClick={canZoomIn ? onZoomIn : undefined}
          >
            <Icon name="zoomIn" />
          </Button>
          <p aria-live="polite" className="sr-only" data-testid="zoom-status">
            {statusLine(zoom, announced)}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
