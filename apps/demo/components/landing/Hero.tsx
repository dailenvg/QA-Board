"use client";

import { motion, useReducedMotion } from "motion/react";
import { duration, ease, fadeOnly, fadeUp, staggerGroup } from "@/lib/motion";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { HeroIllustration } from "./HeroIllustration";

const PROOF_POINTS = ["No accounts", "No extension", "Lands in your PR"] as const;

/** Above-the-fold pitch with a staggered entrance. */
export function Hero() {
  const reduce = useReducedMotion();
  const item = reduce ? fadeOnly : fadeUp;

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="grid-paper absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
      />
      <div className="container-page grid items-center gap-16 pt-16 pb-section lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <motion.div initial="hidden" animate="visible" variants={staggerGroup(0.06, 0.08)}>
          <motion.p variants={item} className="label-caps flex items-center gap-3 text-accent">
            <Icon name="pin" className="size-4" />
            Open source · Self-hosted
          </motion.p>
          <motion.h1
            variants={item}
            id="hero-title"
            className="mt-6 font-display text-display text-balance"
          >
            Feedback pinned <em className="text-accent">exactly</em> where it belongs.
          </motion.h1>
          <motion.p variants={item} className="mt-8 max-w-xl text-lead text-muted text-pretty">
            Reviewers click any element on your Vercel preview and leave a comment. It shows up as a
            threaded comment on the pull request, with a screenshot and a link back to the spot.
          </motion.p>
          <motion.div variants={item} className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="#pricing" testId="hero-cta">
              Get started
              <Icon name="arrowRight" className="size-4" />
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary">
              See how it works
            </ButtonLink>
          </motion.div>
          <motion.ul
            variants={item}
            className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-small text-muted"
          >
            {PROOF_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Icon name="check" className="size-4 text-accent" />
                {point}
              </li>
            ))}
          </motion.ul>
        </motion.div>
        <motion.div
          data-testid="hero-illustration"
          initial={{ opacity: 0, y: reduce ? 0 : 32, scale: reduce ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: duration.page, ease: ease.out, delay: reduce ? 0 : 0.2 }}
        >
          <HeroIllustration />
        </motion.div>
      </div>
    </section>
  );
}
