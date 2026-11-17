"use client";

import { motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { Logo } from "../brand/Logo";
import { Squiggy } from "../brand/mascot/Squiggy";
import type { Mood } from "../brand/mascot/moods";
import { accentStyle } from "../share/brand-accent";
import { BrandFrame } from "../share/BrandMark";
import { PasswordRevealContext, useRevealedPasswords } from "./password-reveal";

/** A company the panel speaks for (an invite's workspace): its logo or default mark, name and color. */
export interface AuthPanelBrand {
  name: string;
  /** `#rrggbb`, or null for Squint's own accent. */
  color: string | null;
  /** Its logo's URL; null draws its default mark. */
  logoSrc: string | null;
}

interface AuthPanelProps {
  title: string;
  description: ReactNode;
  /**
   * Squiggy follows the form: thinking while it works, surprised at an error, happy when done.
   * While a password field inside shows its password, Squiggy also shuts its eyes and looks away.
   */
  mood: Mood;
  /** The form or the way on; none for a state that's only words (no empty gap under them). */
  children?: ReactNode;
  /** Links under the form, such as back to sign in. */
  footer?: ReactNode;
  /**
   * Move focus to the title on mount. For panels that replace a form the user just submitted
   * (sent, expired), so focus doesn't fall back to the page and screen readers hear the change.
   */
  focusTitle?: boolean;
  /**
   * Whose page it is: their logo frame and name on top of the card, their
   * color along its top edge, and Squint's logo under the card instead of above.
   */
  brand?: AuthPanelBrand | null;
}

const STAGGER = staggerGroup();

/**
 * The sign-in, password reset and invite pages: one floating panel, centered,
 * Squiggy on top; on an invite's page, under the inviting company's name.
 */
export function AuthPanel({
  title,
  description,
  mood,
  children,
  footer,
  focusTitle = false,
  brand = null,
}: AuthPanelProps) {
  const reveal = useRevealVariants();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const passwords = useRevealedPasswords();

  useEffect(() => {
    // Runs when the panel swaps in (focusTitle is fixed per panel), not on every re-render.
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-8">
      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="visible"
        style={brand ? accentStyle(brand.color) : undefined}
        className="flex w-full max-w-md flex-col items-center gap-4"
      >
        {brand ? null : (
          <motion.div variants={reveal}>
            <Logo linked={false} caption="Visual review" />
          </motion.div>
        )}
        <motion.section
          variants={reveal}
          aria-labelledby={titleId}
          data-branded={brand ? true : undefined}
          className="relative flex w-full flex-col gap-6 overflow-hidden rounded-panel bg-panel px-5 py-8 shadow-float sm:px-8"
        >
          {/* The company's color as the card's top edge, cut to its rounded corners (as ProjectSignIn). */}
          {brand?.color ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-guest-accent dark:bg-guest-accent-dark"
            />
          ) : null}
          {/* display: contents: only orchestrates, so the section's gap still spaces its children. */}
          <motion.div variants={STAGGER} className="contents">
            {brand ? (
              <motion.div
                variants={reveal}
                className="flex max-w-full min-w-0 items-center justify-center gap-3 self-center"
                data-testid="auth-brand"
              >
                <BrandFrame brand={{ custom: true, color: brand.color }} logoSrc={brand.logoSrc} />
                <span
                  className="min-w-0 truncate text-heading font-bold tracking-tight"
                  title={brand.name}
                  data-testid="auth-brand-name"
                >
                  {brand.name}
                </span>
              </motion.div>
            ) : null}
            <motion.div variants={reveal} className="flex flex-col items-center gap-3 text-center">
              <Squiggy
                mood={mood}
                averted={passwords.anyRevealed}
                size={96}
                still
                label="Squiggy"
              />
              <h1
                ref={titleRef}
                id={titleId}
                tabIndex={focusTitle ? -1 : undefined}
                className="max-w-full text-title font-bold text-balance wrap-break-word focus:outline-none"
              >
                {title}
              </h1>
              {/* wrap-anywhere: an invite's line can hold an email address wider than a phone. */}
              <div className="max-w-full text-body text-pretty text-muted wrap-anywhere">
                {description}
              </div>
            </motion.div>
            {children ? (
              <motion.div variants={reveal} className="flex flex-col gap-4">
                <PasswordRevealContext value={passwords.report}>{children}</PasswordRevealContext>
              </motion.div>
            ) : null}
          </motion.div>
        </motion.section>
        {footer ? (
          <motion.div variants={reveal} className="flex flex-wrap justify-center gap-x-4">
            {footer}
          </motion.div>
        ) : null}
        {/* Under a company's card, where its review happens. */}
        {brand ? (
          <motion.div variants={reveal}>
            <Logo linked={false} caption="Visual review" />
          </motion.div>
        ) : null}
      </motion.div>
    </main>
  );
}
