"use client";

import Image from "next/image";
import { useState } from "react";
import type { CompanyBadge as Badge } from "@/lib/avatar/company-badge";
import { companyFill, drawCompanyBadge } from "@/lib/avatar/default-avatar";

interface CompanyBadgeProps {
  badge: Badge;
  /** Its side in CSS px. */
  px: number;
  /** Where it hangs, its size and its cut-out ring. */
  className: string;
}

const ROUNDED = "rounded-[25%]";

/** Without a logo: the company's color with a solid building (only the color when tiny). */
function DefaultBadge({ color, px }: { color: string | null; px: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-testid="company-badge"
      data-mark="company"
      className={`block size-full ${ROUNDED}`}
    >
      {drawCompanyBadge(companyFill(color), px).map((shape, index) => (
        <path key={index} d={shape.d} fill={shape.fill} />
      ))}
    </svg>
  );
}

/**
 * The company's icon as a small rounded square (a logo tile's radius, never a
 * circle, so it can't pass for a second person or a status dot), hung off
 * the avatar's corner, with a hairline so a white logo stays defined on a white
 * card: line-strong, since line (1.27:1 on white) all but vanished there. A
 * logo that won't load is left out, never a broken image. No motion of its
 * own: it arrives with the avatar.
 */
export function CompanyBadge({ badge, px, className }: CompanyBadgeProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const { logoSrc } = badge;
  if (logoSrc && logoSrc === brokenSrc) return null;
  return (
    <span aria-hidden="true" className={`absolute ${ROUNDED} ${className}`}>
      {logoSrc ? (
        <Image
          src={logoSrc}
          alt=""
          width={px}
          height={px}
          unoptimized
          onError={() => setBrokenSrc(logoSrc)}
          data-testid="company-badge"
          className={`block size-full object-cover ${ROUNDED}`}
        />
      ) : (
        <DefaultBadge color={badge.color} px={px} />
      )}
      <span
        className={`pointer-events-none absolute inset-0 ${ROUNDED} ring-1 ring-line-strong ring-inset`}
      />
    </span>
  );
}
