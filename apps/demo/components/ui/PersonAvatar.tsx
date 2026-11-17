"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import type { CompanyBadge as Badge } from "@/lib/avatar/company-badge";
import { personMonogramName } from "@/lib/monogram";
import { fadeOnly } from "@/lib/motion";
import { CompanyBadge } from "../avatar/CompanyBadge";
import { PersonMark } from "../avatar/PersonMark";
import { MonogramTile } from "../brand/MonogramTile";

/** 28px on a comment; 36px beside the sidebar's account menu; 40px on a Members row. */
type AvatarSize = "xs" | "sm" | "md";

/** What the avatar sits on: the company badge's cut-out ring takes its color. */
export type AvatarSurface = "panel" | "card" | "tile";

/**
 * Who it is, for what stands in without a photo: someone on the team gets
 * the default mark in their pin color (initials under a head, or head and
 * shoulders beside the company badge), the admin theirs, and a client the
 * plain initials circle.
 */
export type AvatarPerson = "member" | "admin" | "client";

interface AvatarMetrics {
  box: string;
  px: number;
  /** The badge: half the avatar wide, hung off its bottom-left corner by `hang`. */
  badge: string;
  badgePx: number;
  hang: string;
}

const SIZES: Record<AvatarSize, AvatarMetrics> = {
  xs: { box: "size-7", px: 28, badge: "size-3.5", badgePx: 14, hang: "-left-0.5 -bottom-0.5" },
  sm: { box: "size-9", px: 36, badge: "size-4.5", badgePx: 18, hang: "-left-1 -bottom-1" },
  md: { box: "size-10", px: 40, badge: "size-5", badgePx: 20, hang: "-left-1 -bottom-1" },
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
  person?: AvatarPerson;
  /**
   * The company's badge, hung off the avatar's bottom-left corner (4b.15), for
   * someone on the team; null without one. Decorative: the name is always beside it.
   */
  badge?: Badge | null;
  /** Where the avatar sits, for the badge's cut-out ring. */
  surface?: AvatarSurface;
  photoTestId?: string;
  /** On whatever stands in without a photo: a default mark (initials or not) or a client's initials. */
  initialsTestId?: string;
}

interface StandInProps {
  person: AvatarPerson;
  /** A company badge shows over the corner. */
  badged: boolean;
  /** Their name, else their email. */
  label: string;
  px: number;
  testId?: string;
}

/** What shows without a photo: the default mark, free in the slot, or a client's initials circle. */
function StandIn({ person, badged, label, px, testId }: StandInProps) {
  if (person !== "client") {
    return (
      <PersonMark
        label={label}
        admin={person === "admin"}
        badged={badged}
        size={px}
        testId={testId}
      />
    );
  }
  return (
    <MonogramTile name={label} className="size-full rounded-pill text-label" testId={testId} />
  );
}

/**
 * Someone's photo, or their default mark without one, with the company badge
 * for the team. One fixed slot: photo and mark cross-fade in place, so the
 * text beside it never shifts. A photo that won't load (removed in another
 * tab) gives way to the mark, and a badge that won't load is left out:
 * never a broken image.
 */
export function PersonAvatar({
  name,
  fallback,
  src,
  size = "sm",
  person = "member",
  badge = null,
  surface = "card",
  photoTestId,
  initialsTestId,
}: PersonAvatarProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const { box, px, badge: badgeBox, badgePx, hang } = SIZES[size];
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
            <StandIn
              person={person}
              badged={badge !== null}
              label={personMonogramName(name, fallback)}
              px={px}
              testId={initialsTestId}
            />
          </motion.span>
        )}
      </AnimatePresence>
      {badge ? (
        <CompanyBadge
          badge={badge}
          px={badgePx}
          // The ring's color tracks a tinting card's `transition-colors` at the same default duration.
          className={`${hang} ${badgeBox} transition-shadow ${CUT_OUT[surface]}`}
        />
      ) : null}
    </span>
  );
}
