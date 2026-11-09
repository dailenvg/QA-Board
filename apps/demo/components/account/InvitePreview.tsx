"use client";

import { motion, useReducedMotion } from "motion/react";
import { senderDisplayName } from "@/lib/email/from-header";
import { instant, spring } from "@/lib/motion";
import { accentStyle } from "../share/brand-accent";
import { BrandFrame } from "../share/BrandMark";
import { Icon } from "../ui/Icon";

interface InvitePreviewProps {
  /** The workspace's name as typed: the company guests see. */
  name: string;
  /** A usable `#rrggbb` as typed, or null (Squint's blue). */
  color: string | null;
  /** The sender name as typed; blank uses the workspace's name. */
  senderName: string;
  logoSrc: string | null;
}

/** Stands in while the name field is blank, so the preview never shows an empty lockup. */
const UNNAMED = "Your company";

/**
 * How a guest meets the workspace, from the settings as typed (saved or
 * not): the invitation email's sender, and the top of a review link with its
 * logo (or monogram), name and accent. The accent rule eases to each new color.
 */
export function InvitePreview({ name, color, senderName, logoSrc }: InvitePreviewProps) {
  const reduce = useReducedMotion();
  const company = name.trim() || UNNAMED;
  const brand = { custom: true, name: company, color };
  return (
    <figure className="flex flex-col gap-3" data-testid="invite-preview">
      <figcaption className="text-body font-semibold">What guests see</figcaption>
      <div className="flex flex-col gap-4 rounded-tile bg-panel p-4">
        <p className="flex min-w-0 items-center gap-2 text-meta text-muted">
          <Icon name="mail" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">
            From{" "}
            <strong className="font-semibold text-ink" data-testid="invite-preview-sender">
              {senderDisplayName({ fromEmailName: senderName, workspaceName: company })}
            </strong>
          </span>
        </p>
        <div
          style={accentStyle(color)}
          className="flex flex-col gap-3 overflow-hidden rounded-tile bg-card shadow-seg"
        >
          <motion.span
            aria-hidden="true"
            className="block h-1 bg-guest-accent dark:bg-guest-accent-dark"
            animate={{ opacity: color ? 1 : 0 }}
            transition={reduce ? instant : spring.soft}
          />
          <div className="flex min-w-0 items-center gap-3 px-4">
            <BrandFrame brand={brand} logoSrc={logoSrc} />
            <span className="flex min-w-0 flex-col">
              <span
                className="truncate text-heading font-bold tracking-tight"
                data-testid="invite-preview-name"
              >
                {company}
              </span>
              <span className="text-meta text-muted">Shared review</span>
            </span>
          </div>
          <p className="px-4 pb-4 text-body text-pretty">
            {company} invited you to leave feedback on this project. Here&apos;s how.
          </p>
        </div>
      </div>
    </figure>
  );
}
