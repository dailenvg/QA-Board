"use client";

import { motion } from "motion/react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";

const STEPS: ReadonlyArray<{ icon: IconName; title: string; body: string }> = [
  { icon: "globe", title: "Add a project", body: "Paste a website address or upload an image." },
  {
    icon: "messagePlus",
    title: "Pin comments",
    body: "Click or tap anywhere on it to leave feedback.",
  },
  { icon: "check", title: "Resolve them", body: "Mark each comment resolved once it's fixed." },
];

const stagger = staggerGroup(0.07, 0.2);

/** No projects anywhere yet: how Squint works, and the first step. */
export function OverviewEmpty({ onAction }: { onAction: () => void }) {
  const reveal = useRevealVariants();
  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      animate="visible"
      aria-labelledby="overview-empty-title"
      data-testid="overview-empty"
      className="flex flex-1 flex-col items-center justify-center gap-6 rounded-panel bg-tile px-6 py-12 text-center"
    >
      <motion.div variants={reveal} className="max-w-md">
        <h2 id="overview-empty-title" className="text-title font-bold">
          No projects yet
        </h2>
        <p className="mt-2 text-body text-muted">
          Once you add a project, your folders show up here with their newest projects inside.
        </p>
      </motion.div>
      <ol className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <motion.li
            key={step.title}
            variants={reveal}
            className="flex items-start gap-3 rounded-card bg-card p-4 text-left shadow-seg sm:flex-col"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand-text">
              <Icon name={step.icon} className="size-5" />
            </span>
            <span>
              <span className="block text-heading font-semibold">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </span>
              <span className="mt-1 block text-meta text-muted">{step.body}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      {/* Secondary: the toolbar's (or sidebar's) New project is the screen's one primary action. */}
      <motion.div variants={reveal}>
        <Button variant="secondary" onClick={onAction} data-testid="overview-empty-action">
          <Icon name="plus" className="size-5" />
          Add your first project
        </Button>
      </motion.div>
    </motion.section>
  );
}
