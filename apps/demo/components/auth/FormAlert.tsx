"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { Icon } from "../ui/Icon";

interface FormAlertProps {
  /** Shown while set; the live region itself always stays so screen readers announce changes. */
  message: string | null;
  tone?: "error" | "info";
  testId?: string;
}

const TONES = {
  error: "bg-danger-soft text-danger",
  info: "bg-resolved-soft text-resolved-text",
};

/** A form-level message: an error (role="alert") or a notice (role="status"). */
export function FormAlert({ message, tone = "error", testId }: FormAlertProps) {
  const variants = usePopVariants();
  return (
    <div role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      <AnimatePresence initial={false}>
        {message ? (
          <motion.p
            key={message}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`flex items-start gap-2 rounded-tile px-4 py-3 text-body font-medium ${TONES[tone]}`}
          >
            <Icon name={tone === "error" ? "alert" : "check"} className="mt-0.5 size-4 shrink-0" />
            {message}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
