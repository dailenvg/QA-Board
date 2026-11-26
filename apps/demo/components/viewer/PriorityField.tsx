"use client";

import { useId } from "react";
import { COMMENT_PRIORITIES, PRIORITY_LABEL } from "@/lib/store/priority";
import type { CommentPriority } from "@/lib/store/types";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

type Choice = CommentPriority | "none";

const OPTIONS: ReadonlyArray<SegmentOption<Choice>> = [
  { value: "none", label: "None", testId: "priority-none" },
  ...COMMENT_PRIORITIES.map((priority) => ({
    value: priority,
    label: PRIORITY_LABEL[priority],
    testId: `priority-${priority}`,
  })),
];

interface PriorityFieldProps {
  /** Missing for none, where every new comment starts (D9). */
  value: CommentPriority | undefined;
  onChange: (priority: CommentPriority | undefined) => void;
}

/**
 * The composer's "Priority": None, Must fix, Should fix or Nit (U4), one
 * radio group under its visible label. The team and guests both pick here;
 * guests can't change it after posting (D10).
 */
export function PriorityField({ value, onChange }: PriorityFieldProps) {
  // A fading composer and the next one can be on screen together: each thumb glides in its own.
  const thumbId = useId();
  return (
    <div>
      <p className="mb-1 text-meta font-semibold">Priority</p>
      <SegmentedControl
        label="Priority"
        layoutId={`composer-priority-${thumbId}`}
        density="compact"
        stretch
        value={value ?? "none"}
        onChange={(choice) => onChange(choice === "none" ? undefined : choice)}
        options={OPTIONS}
      />
    </div>
  );
}
