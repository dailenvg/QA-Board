"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { duration, ease, lift, useRevealVariants } from "@/lib/motion";
import type { Billing, Plan } from "@/lib/site";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";

/**
 * Inverted card. The accent focus ring is about 2:1 on this surface in dark mode
 * (light ink), so focus inside the card uses the paper colour instead.
 */
const FEATURED_SURFACE = "bg-ink text-paper shadow-lift ring-ink [&_:focus-visible]:outline-paper";

interface PricingCardProps {
  plan: Plan;
  billing: Billing;
}

/** Plan card; the price cross-fades when the billing period changes. */
export function PricingCard({ plan, billing }: PricingCardProps) {
  const variants = useRevealVariants();
  const reduce = useReducedMotion();
  const featured = plan.featured === true;

  return (
    <motion.article
      variants={variants}
      {...(reduce ? {} : lift)}
      data-testid={`pricing-card-${plan.id}`}
      aria-labelledby={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-card p-8 ring-1 lg:p-10 ${
        featured ? FEATURED_SURFACE : "bg-raised shadow-soft ring-rule"
      }`}
    >
      {featured ? (
        <p className="label-caps absolute top-8 right-8 rounded-control bg-accent px-3 py-2 text-on-accent">
          Popular
        </p>
      ) : null}
      <h3 id={`plan-${plan.id}`} className="font-display text-h3">
        {plan.name}
      </h3>
      <p className={`mt-3 text-small ${featured ? "opacity-75" : "text-muted"}`}>
        {plan.description}
      </p>

      <div className="mt-10 flex h-20 items-end gap-3" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${plan.id}-${billing}`}
            className="font-display text-h2"
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -12 }}
            transition={{ duration: duration.micro, ease: ease.out }}
          >
            {plan.price[billing]}
          </motion.span>
        </AnimatePresence>
        <span className={`pb-2 text-small ${featured ? "opacity-75" : "text-muted"}`}>
          {plan.cadence[billing]}
        </span>
      </div>

      <ul className="mt-8 flex-1 space-y-3 border-t border-current/15 pt-8 text-small">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
            {feature}
          </li>
        ))}
      </ul>

      <ButtonLink
        href="#faq"
        variant={featured ? "primary" : "secondary"}
        className="mt-10 w-full"
        testId={`pricing-cta-${plan.id}`}
      >
        {plan.cta}
      </ButtonLink>
    </motion.article>
  );
}
