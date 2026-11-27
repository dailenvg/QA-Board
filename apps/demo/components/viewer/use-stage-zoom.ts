import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useShortcut } from "@/lib/use-shortcut";
import {
  anchorCorrection,
  anchorOn,
  clampZoom,
  effectiveZoom,
  visibleCentre,
  wheelZoom,
  zoomStepDown,
  zoomStepUp,
  type Point,
  type Zoom,
} from "./stage-zoom";
import { useSpacePan, type PanState } from "./use-space-pan";

/** What a surface (`SurfaceImage`) reads from the stage's zoom. */
export interface StageZoomSurface {
  zoom: Zoom;
  /**
   * Hands the drawn surface to the zoom: its element and its width in surface px. Returns its
   * release, for when it leaves the stage or changes size.
   */
  attach: (node: HTMLElement, width: number) => () => void;
  /** Says the stage can't show its surface (it failed to load); returns its release. */
  markMissing: () => () => void;
}

/** Outside a zoomable stage, a surface is drawn at Fit. */
export const StageZoomContext = createContext<StageZoomSurface>({
  zoom: "fit",
  attach: () => () => {},
  markMissing: () => () => {},
});

export function useStageZoomSurface(): StageZoomSurface {
  return use(StageZoomContext);
}

/** For a stage's "can't be shown" state: while it's up, there's nothing to zoom. */
export function useMissingSurface(): void {
  const { markMissing } = useStageZoomSurface();
  useEffect(() => markMissing(), [markMissing]);
}

export interface StageZoom {
  zoom: Zoom;
  /** The level shown now (at Fit, the fit's); null until a surface is on stage and measured. */
  effective: number | null;
  /**
   * The level the last zoom asked for (buttons, menu, keys, wheel) landed on, for screen readers;
   * null until one is. A Fit that changes with the window or the page isn't announced.
   */
  announced: number | null;
  /** A surface is drawn on the stage now. */
  attached: boolean;
  /** The stage shows that its surface can't be loaded (`useMissingSurface`). */
  missing: boolean;
  pan: PanState;
  surface: StageZoomSurface;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (zoom: Zoom) => void;
}

/** A spot on the surface to keep under `point` (client px) once the new zoom is drawn. */
interface Anchor {
  point: Point;
  on: Point;
}

/**
 * The stage's zoom, kept for the visit: across pages, snapshots and breakpoints, back to Fit on
 * a reload. Zoom in and out step (`ZOOM_STEPS`), as do the keys (+ or =, -, 0 for Fit, 1 for
 * 100%), around the centre of the visible stage; Cmd/Ctrl+wheel and a trackpad's pinch zoom
 * smoothly around the pointer. Holding Space and dragging moves around (`useSpacePan`). The
 * keys, the wheel and the drag only work while a surface is attached, so a live website's
 * frame is left alone.
 */
export function useStageZoom(scroller: RefObject<HTMLElement | null>): StageZoom {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [surfaceWidth, setSurfaceWidth] = useState<number | null>(null);
  const [fitLevel, setFitLevel] = useState<number | null>(null);
  /** The zoom asked for last, which a render may not have drawn yet (several wheel events). */
  const zoomRef = useRef<Zoom>("fit");
  const fitLevelRef = useRef<number | null>(null);
  const node = useRef<HTMLElement | null>(null);
  const widthRef = useRef<number | null>(null);
  const anchor = useRef<Anchor | null>(null);
  /** A zoom was asked for and isn't drawn yet: its level is announced once it is. */
  const unannounced = useRef(false);
  const [announced, setAnnounced] = useState<number | null>(null);
  const attached = surfaceWidth !== null;
  const [missingCount, setMissingCount] = useState(0);

  const measureFit = useCallback(() => {
    const surface = node.current;
    const width = widthRef.current;
    if (zoomRef.current !== "fit" || !surface || !width) return;
    const level = surface.offsetWidth / width;
    fitLevelRef.current = level;
    setFitLevel(level);
  }, []);

  const attach = useCallback(
    (surface: HTMLElement, width: number) => {
      node.current = surface;
      widthRef.current = width;
      setSurfaceWidth(width);
      // A new surface fits differently; measured now at Fit, else once Fit is asked for.
      fitLevelRef.current = null;
      setFitLevel(null);
      const observer = new ResizeObserver(measureFit);
      observer.observe(surface);
      return () => {
        observer.disconnect();
        if (node.current !== surface) return;
        node.current = null;
        widthRef.current = null;
        setSurfaceWidth(null);
      };
    },
    [measureFit],
  );

  const markMissing = useCallback(() => {
    setMissingCount((count) => count + 1);
    return () => setMissingCount((count) => count - 1);
  }, []);

  const request = useCallback((next: Zoom, point: Point | null) => {
    const surface = node.current;
    const target = next === "fit" ? next : clampZoom(next);
    if (!surface || target === zoomRef.current) return;
    if (point) anchor.current = { point, on: anchorOn(point, surface.getBoundingClientRect()) };
    zoomRef.current = target;
    unannounced.current = true;
    setZoom(target);
  }, []);

  /** Once a zoom asked for is drawn (and a Fit measured), its level for screen readers. */
  const announce = useCallback(() => {
    if (!unannounced.current) return;
    unannounced.current = false;
    setAnnounced(effectiveZoom(zoomRef.current, fitLevelRef.current));
  }, []);

  /** The centre of the stage's visible part, where keys and buttons zoom around. */
  const centre = (): Point | null => {
    const area = scroller.current;
    if (!area) return null;
    return visibleCentre(area.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  /** The level shown now, as the last zoom asked for left it. */
  const current = useCallback(() => effectiveZoom(zoomRef.current, fitLevelRef.current), []);
  const step = (towards: (level: number) => number | null) => {
    const level = current();
    const next = level === null ? null : towards(level);
    if (next !== null) request(next, centre());
  };
  const zoomIn = () => step(zoomStepUp);
  const zoomOut = () => step(zoomStepDown);
  const zoomTo = (next: Zoom) => request(next, centre());

  useShortcut("+", zoomIn, attached);
  useShortcut("=", zoomIn, attached);
  useShortcut("-", zoomOut, attached);
  useShortcut("0", () => zoomTo("fit"), attached);
  useShortcut("1", () => zoomTo(1), attached);

  // The new zoom is drawn: scroll so the spot it was asked around is back where it was, and
  // measure the fit when it's Fit (a surface the same width at Fit doesn't resize).
  useLayoutEffect(() => {
    measureFit();
    announce();
    const area = scroller.current;
    const surface = node.current;
    const asked = anchor.current;
    anchor.current = null;
    if (!area || !surface || !asked) return;
    const by = anchorCorrection(asked.on, surface.getBoundingClientRect(), asked.point);
    area.scrollBy({ left: by.x, top: by.y, behavior: "instant" });
  }, [zoom, scroller, measureFit, announce]);

  // Cmd/Ctrl+wheel, and a trackpad's pinch (a wheel with ctrlKey), zoom around the pointer.
  // Not passive, to keep the browser's own page zoom out of it; a plain wheel still scrolls.
  useEffect(() => {
    const area = scroller.current;
    if (!attached || !area) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const level = current();
      const next = level === null ? null : wheelZoom(level, event.deltaY, event.deltaMode);
      if (next !== null) request(next, { x: event.clientX, y: event.clientY });
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [attached, scroller, current, request]);

  const pan = useSpacePan(scroller, node, attached);
  const surface = useMemo(() => ({ zoom, attach, markMissing }), [zoom, attach, markMissing]);

  return {
    zoom,
    effective: attached ? effectiveZoom(zoom, fitLevel) : null,
    announced,
    attached,
    missing: missingCount > 0,
    pan,
    surface,
    zoomIn,
    zoomOut,
    zoomTo,
  };
}
