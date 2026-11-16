"use client";

import { motion } from "motion/react";
import type { Ref } from "react";
import { usePopVariants } from "@/lib/motion";
import { StateArt } from "../ui/line-art/StateArt";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.empty;

/**
 * Under the owner's own row while nobody else is in or invited (4b.2). No
 * button: the invite card above is the way on. With no seat left, the line
 * goes: the card's notice already says why. Pops out (in card B's presence)
 * when the first invite lands; `ref` lets that presence lift it out of the
 * flow as it leaves, so the invite takes its place without a jump.
 */
export function PeopleEmpty({ left, ref }: { left: number; ref?: Ref<HTMLDivElement> }) {
  const variants = usePopVariants();
  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col items-center gap-2 px-3 py-4 text-center"
      data-testid="people-empty"
    >
      <StateArt scene="invite" size="md" still surface="card" />
      <p className="text-heading font-semibold">{COPY.title}</p>
      {left > 0 ? <p className="text-body text-pretty text-muted">{COPY.line(left)}</p> : null}
    </motion.div>
  );
}
