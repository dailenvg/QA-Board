"use client";

import Image from "next/image";
import { useState } from "react";
import type { CompanyBadge as Badge } from "@/lib/avatar/company-badge";
import { AVATAR_INK, drawCompanyBadge } from "@/lib/avatar/default-avatar";

interface CompanyBadgeProps {
  badge: Badge;
  /** Its side in CSS px. */
  px: number;
  /** Its border's width in CSS px: the avatar's own stroke (`avatarStrokePx`). */
  strokePx: number;
  /** Where it hangs, its size and its cut-out ring. */
  className: string;
}

const ROUNDED = "rounded-[25%]";

/** Without a logo: the bubble's gray with a solid building (only the gray when tiny). */
function DefaultBadge({ px }: { px: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-testid="company-badge"
      data-mark="company"
      className={`block size-full ${ROUNDED}`}
    >
      {drawCompanyBadge(px).map((shape, index) => (
        <path key={index} d={shape.d} fill={shape.fill} />
      ))}
    </svg>
  );
}

/**
 * The company's icon as a small rounded square (a logo tile's radius, never a
 * circle, so it can't pass for a second person or a status dot), hung off
 * the avatar's corner, bordered as the avatar's mark is (Gunmetal, the same
 * width), which also keeps a white logo defined on a white card. A
 * logo that won't load is left out, never a broken image. No motion of its
 * own: it arrives with the avatar.
 */
export function CompanyBadge({ badge, px, strokePx, className }: CompanyBadgeProps) {
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
        <DefaultBadge px={px} />
      )}
      <span
        style={{ boxShadow: `inset 0 0 0 ${strokePx}px ${AVATAR_INK}` }}
        className={`pointer-events-none absolute inset-0 ${ROUNDED}`}
      />
    </span>
  );
}
