export type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand shadow-seg hover:bg-brand-hover active:bg-brand-hover",
  secondary: "bg-card text-ink ring-1 ring-line-strong ring-inset hover:bg-hover active:bg-hover",
  ghost: "text-ink hover:bg-hover active:bg-hover",
  inverse: "bg-inv text-on-inv hover:opacity-90 active:opacity-90",
  danger: "bg-danger text-card hover:opacity-90 active:opacity-90",
};

const BASE =
  "inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-pill font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

export type ButtonSize = "md" | "sm" | "icon";

const SIZES: Record<ButtonSize, string> = {
  md: "px-5 text-nav",
  sm: "px-4 text-body",
  icon: "size-11 shrink-0",
};

/** Class names for anything that looks like a button (buttons and links alike). */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]}`;
}
