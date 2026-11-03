import Link from "next/link";
import type { ReactNode } from "react";

interface TextLinkProps {
  href: string;
  children: ReactNode;
  testId?: string;
}

/** An inline link with a full 44px tap target, for the links around the auth forms. */
export function TextLink({ href, children, testId }: TextLinkProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="inline-flex min-h-11 items-center rounded-row px-1 text-body font-semibold text-brand-text underline decoration-brand-text/40 underline-offset-4 transition-colors hover:decoration-current active:opacity-70"
    >
      {children}
    </Link>
  );
}
