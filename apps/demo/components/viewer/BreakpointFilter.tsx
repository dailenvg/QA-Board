"use client";

import type { Breakpoint } from "@/lib/store/breakpoints";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BREAKPOINT_LABEL } from "./BreakpointSwitch";

/** Which comments the panel lists on a website with comments at several breakpoints. */
export type BreakpointScope = "all" | "breakpoint";

interface BreakpointFilterProps {
  value: BreakpointScope;
  onChange: (value: BreakpointScope) => void;
  /** The breakpoint on the stage, which names the other option. */
  breakpoint: Breakpoint;
}

/** "All breakpoints" (each card says its breakpoint) or just the one on the stage. */
export function BreakpointFilter({ value, onChange, breakpoint }: BreakpointFilterProps) {
  return (
    <div className="px-3">
      <SegmentedControl
        label="Comments from"
        layoutId="comment-breakpoint-scope"
        stretch
        value={value}
        onChange={onChange}
        options={[
          { value: "all", label: "All breakpoints", testId: "breakpoint-scope-all" },
          {
            value: "breakpoint",
            label: BREAKPOINT_LABEL[breakpoint],
            testId: "breakpoint-scope-one",
          },
        ]}
      />
    </div>
  );
}
