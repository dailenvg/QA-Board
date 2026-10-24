"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { press } from "@/lib/motion";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button-styles";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Button with spring hover and press feedback (plain fades with reduced motion).
 * For busy states prefer `aria-disabled` over `disabled`: the button keeps
 * keyboard focus instead of dropping it to the page.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled,
  ...rest
}: ButtonProps) {
  const reduce = useReducedMotion();
  const ariaDisabled = rest["aria-disabled"];
  const inactive = disabled || ariaDisabled === true || ariaDisabled === "true";
  return (
    <motion.button
      type={type}
      disabled={disabled}
      className={`${buttonClass(variant, size)} ${className}`}
      {...(reduce || inactive ? {} : press)}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
