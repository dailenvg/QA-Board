import type { MenuItem } from "../ui/Menu";
import type { Zoom } from "./stage-zoom";

/** The level menu's choices; the 0 and 1 keys pick Fit width and 100% too. */
const PRESETS: ReadonlyArray<{ zoom: Zoom; label: string; testId: string }> = [
  { zoom: "fit", label: "Fit width", testId: "zoom-fit" },
  { zoom: 0.5, label: "50%", testId: "zoom-50" },
  { zoom: 1, label: "100%", testId: "zoom-100" },
  { zoom: 2, label: "200%", testId: "zoom-200" },
  { zoom: 4, label: "400%", testId: "zoom-400" },
];

/** The zoom control's level menu: radio items, the current zoom checked when it's one of them. */
export function zoomMenuItems(zoom: Zoom, onZoomTo: (zoom: Zoom) => void): MenuItem[] {
  return PRESETS.map((preset) => ({
    label: preset.label,
    checked: zoom === preset.zoom,
    testId: preset.testId,
    onSelect: () => onZoomTo(preset.zoom),
  }));
}
