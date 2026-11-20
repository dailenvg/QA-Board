"use client";

import { BREAKPOINTS, BREAKPOINT_WIDTH, type Breakpoint } from "@/lib/store/breakpoints";
import type { IconName } from "../ui/Icon";
import { SegmentedControl } from "../ui/SegmentedControl";

interface BreakpointSwitchProps {
  value: Breakpoint;
  onChange: (breakpoint: Breakpoint) => void;
  /** Active comments at each breakpoint. */
  counts: Readonly<Record<Breakpoint, number>>;
}

/** Each breakpoint's name, as shown on the switch. */
export const BREAKPOINT_LABEL: Record<Breakpoint, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

/** Each breakpoint's icon, on the switch and on cards that name their breakpoint. */
export const BREAKPOINT_ICON: Record<Breakpoint, IconName> = {
  desktop: "monitor",
  tablet: "tablet",
  mobile: "smartphone",
};

const OPTIONS: ReadonlyArray<{ value: Breakpoint; label: string; icon: IconName }> =
  BREAKPOINTS.map((value) => ({
    value,
    label: BREAKPOINT_LABEL[value],
    icon: BREAKPOINT_ICON[value],
  }));

/**
 * Which device width a website is reviewed at, with each one's active
 * comments. Icon-only below `xl`, and without the count chips on phones, so
 * the top bar's rows don't grow; names and counts stay in the accessible
 * names (and the names in tooltips).
 */
export function BreakpointSwitch({ value, onChange, counts }: BreakpointSwitchProps) {
  return (
    <SegmentedControl
      label="Breakpoint"
      layoutId="viewer-breakpoint-thumb"
      labels="wide"
      counts="sm"
      value={value}
      onChange={onChange}
      options={OPTIONS.map((option) => ({
        ...option,
        title: `${option.label}, ${BREAKPOINT_WIDTH[option.value]}px wide`,
        count: counts[option.value],
        countLabel: counts[option.value] === 1 ? "active comment" : "active comments",
        testId: `breakpoint-${option.value}`,
      }))}
    />
  );
}
