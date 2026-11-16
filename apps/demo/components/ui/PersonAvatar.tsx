"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import { personMonogramName } from "@/lib/monogram";
import { fadeOnly } from "@/lib/motion";
import { MonogramTile } from "../brand/MonogramTile";

/** 28px on a comment; 36px beside the sidebar's account menu; 40px on a Members row. */
type AvatarSize = "xs" | "sm" | "md";

/** What the avatar sits on: the company badge's cut-out ring takes its color. */
export type AvatarSurface = "panel" | "card" | "tile";

interface AvatarMetrics {
  box: string;
  px: number;
  /** The badge: half the avatar wide, hung off its bottom-right corner by `hang`. */
  badge: string;
  badgePx: number;
  hang: string;
}

const SIZES: Record<AvatarSize, AvatarMetrics> = {
  xs: { box: "size-7", px: 28, badge: "size-3.5", badgePx: 14, hang: "-right-0.5 -bottom-0.5" },
  sm: { box: "size-9", px: 36, badge: "size-4.5", badgePx: 18, hang: "-right-1 -bottom-1" },
  md: { box: "size-10", px: 40, badge: "size-5", badgePx: 20, hang: "-right-1 -bottom-1" },
};

/**
 * A 2px frame in the surface's color, so the badge reads as a tile clipped onto the avatar's
 * corner, over a soft shadow that lifts it off the photo. A card that tints (a comment card on
 * hover or press) sets `--avatar-surface` to its tint, and paints its own background from it,
 * so the frame never leaves a halo of the resting color.
 */
const CUT_OUT: Record<AvatarSurface, string> = {
  panel: "shadow-[0_0_0_2px_var(--color-panel),var(--shadow-seg)]",
  card: "shadow-[0_0_0_2px_var(--avatar-surface,var(--color-card)),var(--shadow-seg)]",
  tile: "shadow-[0_0_0_2px_var(--color-tile),var(--shadow-seg)]",
};

interface PersonAvatarProps {
  /** Whose initials stand in without a photo: their name, else what `fallback` says (an email). */
  name: string | null;
  fallback: string;
  /** Their photo's URL; null without one. */
  src: string | null;
  size?: AvatarSize;
  /**
   * The company's icon hung off the avatar's bottom-right corner (4b.15), for someone
   * on the team; null without one. Decorative: the name is always beside it.
   */
  badgeSrc?: string | null;
  /** Where the avatar sits, for the badge's cut-out ring. */
  surface?: AvatarSurface;
  photoTestId?: string;
  initialsTestId?: string;
}

/**
 * Someone's photo, or their initials without one, with the company badge for
 * the team. One fixed slot: photo and initials cross-fade in place, so the
 * text beside it never shifts. A photo that won't load (removed in another
 * tab) gives way to the initials, and a badge that won't load is left out:
 * never a broken image.
 */
export function PersonAvatar({
  name,
  fallback,
  src,
  size = "sm",
  badgeSrc = null,
  surface = "card",
  photoTestId,
  initialsTestId,
}: PersonAvatarProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const { box, px } = SIZES[size];
  return (
    <span className={`relative ${box} shrink-0`}>
      <AnimatePresence initial={false}>
        {src && src !== brokenSrc ? (
          <motion.span
            key={src}
            variants={fadeOnly}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0"
          >
            <Image
              src={src}
              alt=""
              width={px}
              height={px}
              unoptimized
              onError={() => setBrokenSrc(src)}
              data-testid={photoTestId}
              className="size-full rounded-pill object-cover"
            />
          </motion.span>
        ) : (
          <motion.span
            key="initials"
            variants={fadeOnly}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0"
          >
            <MonogramTile
              name={personMonogramName(name, fallback)}
              color={null}
              className="size-full rounded-pill text-label"
              testId={initialsTestId}
            />
          </motion.span>
        )}
      </AnimatePresence>
      {badgeSrc ? <CompanyBadge src={badgeSrc} size={size} surface={surface} /> : null}
    </span>
  );
}

interface CompanyBadgeProps {
  src: string;
  size: AvatarSize;
  surface: AvatarSurface;
}

/**
 * The company's icon as a small rounded square (a logo tile's radius, never a
 * circle, so it can't pass for a second person or a status dot), hung off
 * the avatar's corner, with a hairline so a white logo stays defined on a white
 * card: line-strong, since line (1.27:1 on white) all but vanished there. No
 * motion of its own: it arrives with the avatar.
 */
function CompanyBadge({ src, size, surface }: CompanyBadgeProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const { badge, badgePx, hang } = SIZES[size];
  if (src === brokenSrc) return null;
  return (
    <span
      aria-hidden="true"
      // The ring's color tracks a tinting card's `transition-colors` at the same default duration.
      className={`absolute ${hang} ${badge} rounded-[25%] transition-shadow ${CUT_OUT[surface]}`}
    >
      <Image
        src={src}
        alt=""
        width={badgePx}
        height={badgePx}
        unoptimized
        onError={() => setBrokenSrc(src)}
        data-testid="company-badge"
        className="block size-full rounded-[25%] object-cover"
      />
      <span className="pointer-events-none absolute inset-0 rounded-[25%] ring-1 ring-line-strong ring-inset" />
    </span>
  );
}
