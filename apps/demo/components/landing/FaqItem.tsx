"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { duration, ease } from "@/lib/motion";
import type { Faq } from "@/lib/site";
import { Icon } from "../ui/Icon";

interface FaqItemProps {
  faq: Faq;
}

/** Disclosure row; the answer animates height and opacity in and out. */
export function FaqItem({ faq }: FaqItemProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelId = useId();

  return (
    <div className="border-b border-rule">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-16 w-full items-center justify-between gap-6 py-5 text-left text-lead font-medium transition-colors hover:text-accent-text"
        >
          {faq.question}
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: reduce ? 0 : duration.micro }}
            className="grid size-10 shrink-0 place-items-center rounded-control ring-1 ring-rule"
          >
            <Icon name="plus" className="size-4" />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="answer"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : duration.component, ease: ease.out }}
          >
            <p className="max-w-3xl pb-6 text-body text-muted">{faq.answer}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
