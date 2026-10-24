import { STATUS_LABEL, type ProjectStatus } from "@/lib/store/status";
import type { SegmentOption } from "../ui/SegmentedControl";

export type StatusFilterValue = "all" | ProjectStatus;

export const STATUS_FILTER_OPTIONS: ReadonlyArray<SegmentOption<StatusFilterValue>> = [
  { value: "all", label: "All" },
  { value: "ready", label: STATUS_LABEL.ready },
  { value: "comments", label: STATUS_LABEL.comments },
  { value: "resolved", label: STATUS_LABEL.resolved },
];
