"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { press } from "@/lib/motion";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button-styles";

const MotionLink = motion.create(Link);

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  testId?: string;
  external?: boolean;
  ariaLabel?: string;
}

/** Link styled as a button, with spring hover and press feedback. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  testId,
  external = false,
  ariaLabel,
}: ButtonLinkProps) {
  const reduce = useReducedMotion();
  return (
    <MotionLink
      href={href}
      data-testid={testId}
      aria-label={ariaLabel}
      className={`${buttonClass(variant, size)} ${className}`}
      {...(reduce ? {} : press)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
      {external && !ariaLabel ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </MotionLink>
  );
}
