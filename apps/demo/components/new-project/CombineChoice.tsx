"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { instant, spring } from "@/lib/motion";

export type ImageGrouping = "separate" | "combine";

const OPTIONS: ReadonlyArray<{ value: ImageGrouping; title: string; hint: string }> = [
  {
    value: "separate",
    title: "One project per file",
    hint: "Each image becomes its own project, named after its file.",
  },
  {
    value: "combine",
    title: "Combine into one project",
    hint: "Each image becomes a page, in the order below.",
  },
];

interface CombineChoiceProps {
  value: ImageGrouping;
  onChange: (value: ImageGrouping) => void;
}

/** How several images become projects: one each, or one project with a page per image. */
export function CombineChoice({ value, onChange }: CombineChoiceProps) {
  const name = useId();
  const reduce = useReducedMotion();
  return (
    <fieldset>
      <legend className="mb-2 block text-body font-semibold">Add these images as</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              data-testid={`grouping-${option.value}`}
              className={`relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-tile p-4 transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${
                selected ? "bg-brand-soft" : "bg-card ring-1 ring-line ring-inset hover:bg-hover"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="image-grouping"
                  transition={reduce ? instant : spring.snappy}
                  className="pointer-events-none absolute inset-0 rounded-tile ring-2 ring-brand-text"
                />
              ) : null}
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="relative text-body font-semibold">{option.title}</span>
              <span className="relative text-meta text-muted">{option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
