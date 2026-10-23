"use client";

import { motion, useReducedMotion } from "motion/react";
import { hoverLift, useRevealVariants } from "@/lib/motion";
import type { Feature } from "@/lib/site";
import { Icon } from "../ui/Icon";

interface FeatureCardProps {
  feature: Feature;
}

/** One feature tile; reveals with its group and lifts on hover. */
export function FeatureCard({ feature }: FeatureCardProps) {
  const variants = useRevealVariants();
  const reduce = useReducedMotion();
  return (
    <motion.article
      variants={variants}
      {...(reduce ? {} : hoverLift)}
      className="rounded-card bg-raised p-8 shadow-soft ring-1 ring-rule"
    >
      <span className="grid size-11 place-items-center rounded-tile bg-paper text-accent ring-1 ring-rule">
        <Icon name={feature.icon} />
      </span>
      <h3 className="mt-8 text-lead font-semibold">{feature.title}</h3>
      <p className="mt-3 text-body text-muted">{feature.body}</p>
    </motion.article>
  );
}
