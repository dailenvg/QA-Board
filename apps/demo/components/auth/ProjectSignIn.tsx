"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { Logo } from "../brand/Logo";
import { accentStyle } from "../share/brand-accent";
import { BrandFrame } from "../share/BrandMark";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";

/** Whose project it is, when the link opens to one; null for any link that doesn't. */
export interface ProjectSignInBrand {
  company: string;
  project: string;
  color: string | null;
  /** The company's icon (its logo drawn square), or null to show its monogram. */
  logoSrc: string | null;
}

interface ProjectSignInProps {
  brand: ProjectSignInBrand | null;
  /** /login, returning to this project once signed in. */
  signInHref: string;
}

const STAGGER = staggerGroup();

const SQUINT = { custom: false, name: "Squint", color: null } as const;

/**
 * A project's link opened signed out: whose it is (the company's logo or
 * monogram and name) and the project's name, and Sign in, which comes back
 * here, with a line pointing anyone not on the team to the sender for a
 * review link. Nothing else of the project. A link that doesn't open to a live
 * project (unknown, in the trash, archived, its workspace closed) shows the
 * same screen under Squint's own name, without a project, so it says no more
 * than a made-up address would.
 */
export function ProjectSignIn({ brand, signInHref }: ProjectSignInProps) {
  const reveal = useRevealVariants();
  const titleId = useId();
  const frame = brand ? { custom: true, name: brand.company, color: brand.color } : SQUINT;
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-8">
      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="visible"
        style={accentStyle(frame.color)}
        className="flex w-full max-w-md flex-col items-center gap-4"
      >
        <motion.section
          variants={reveal}
          aria-labelledby={titleId}
          data-testid="project-sign-in"
          data-branded={brand ? true : undefined}
          className="relative flex w-full flex-col gap-6 overflow-hidden rounded-panel bg-panel px-5 py-8 shadow-float sm:px-8"
        >
          {/*
            The company's color as the card's top edge: edge to edge, so the card's rounded corners
            (overflow-hidden) cut it and it follows their curve, as the invitation preview's does.
          */}
          {frame.color ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-guest-accent dark:bg-guest-accent-dark"
            />
          ) : null}
          {/* display: contents: only orchestrates, so the section's gap still spaces its children. */}
          <motion.div variants={STAGGER} className="contents">
            <motion.div variants={reveal} className="flex flex-col items-center gap-4 text-center">
              <span
                className="flex max-w-full min-w-0 items-center gap-3"
                data-testid="project-sign-in-brand"
              >
                <BrandFrame brand={frame} logoSrc={brand?.logoSrc ?? null} />
                <span
                  className="min-w-0 text-heading font-bold tracking-tight wrap-anywhere"
                  data-testid="project-sign-in-company"
                >
                  {frame.name}
                </span>
              </span>
              {/* Full width, so a project named with no spaces breaks instead of running past the card. */}
              <div className="w-full">
                <h1 id={titleId} className="text-title font-bold text-balance wrap-break-word">
                  {brand ? `Sign in to open ${brand.project}` : "Sign in to open this project"}
                </h1>
                <p className="mt-2 flex items-center justify-center gap-2 text-body text-pretty text-muted">
                  <Icon name="lock" className="size-4 shrink-0" />
                  {brand
                    ? `Only the ${brand.company} team can open it.`
                    : "Only its team can open it."}
                </p>
              </div>
            </motion.div>
            <motion.div variants={reveal} className="flex flex-col">
              <ButtonLink href={signInHref} testId="project-sign-in-link">
                Sign in
              </ButtonLink>
              {/* For a client sent the team's link by mistake: the way to a link they can open. */}
              <p className="mt-3 text-center text-meta text-pretty text-muted">
                Not on the team? Ask whoever sent you here for a review link.
              </p>
            </motion.div>
          </motion.div>
        </motion.section>
        {/* Under a company's card, where its review happens; Squint's own card already says it. */}
        {brand ? (
          <motion.div variants={reveal}>
            <Logo linked={false} caption="Visual review" />
          </motion.div>
        ) : null}
      </motion.div>
    </main>
  );
}
