"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { SquintMascot } from "../brand/mascot/SquintMascot";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface DashboardEmptyProps {
  /** `folder`: nothing in this folder yet. `filter`: nothing matches the status filter. */
  kind: "folder" | "filter";
  onAction: () => void;
}

const COPY = {
  folder: {
    title: "Nothing to review yet",
    body: "Add a website, images or a PDF, then drop pins on it to leave feedback.",
    action: "New project",
  },
  filter: {
    title: "No projects with this status",
    body: "Try another filter, or show every project in this folder.",
    action: "Show all",
  },
} as const;

/** Empty folder or empty filter result, with the mascot idling or asleep. */
export function DashboardEmpty({ kind, onAction }: DashboardEmptyProps) {
  const variants = useRevealVariants();
  const copy = COPY[kind];
  return (
    <motion.section
      variants={variants}
      initial="hidden"
      animate="visible"
      data-testid="dashboard-empty"
      className="grid flex-1 place-items-center rounded-panel bg-tile px-6 py-14 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <SquintMascot mood={kind === "folder" ? "idle" : "sleeping"} size={132} />
        <div>
          <h2 className="text-title font-bold">{copy.title}</h2>
          <p className="mt-2 text-body text-muted">{copy.body}</p>
        </div>
        <Button onClick={onAction} variant={kind === "folder" ? "primary" : "secondary"}>
          {kind === "folder" ? <Icon name="plus" className="size-5" /> : null}
          {copy.action}
        </Button>
      </div>
    </motion.section>
  );
}
