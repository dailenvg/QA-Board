"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { personMonogramName } from "@/lib/monogram";
import { fadeOnly } from "@/lib/motion";
import { MonogramTile } from "../brand/MonogramTile";

/** 36px beside the sidebar's account menu; 40px on a Members row. */
type AvatarSize = "sm" | "md";

const SIZES: Record<AvatarSize, { box: string; px: number }> = {
  sm: { box: "size-9", px: 36 },
  md: { box: "size-10", px: 40 },
};

interface PersonAvatarProps {
  /** Whose initials stand in without a photo: their name, else what `fallback` says (an email). */
  name: string | null;
  fallback: string;
  /** Their photo's URL; null without one. */
  src: string | null;
  size?: AvatarSize;
  /**
   * Drawn on the avatar's bottom-right edge, such as the company badge (4b.15).
   * Decorative: the name is always beside the avatar.
   */
  badge?: ReactNode;
  photoTestId?: string;
  initialsTestId?: string;
}

/**
 * Someone's photo, or their initials without one. One fixed slot: photo and
 * initials cross-fade in place, so the text beside it never shifts. A photo
 * that won't load (removed in another tab) gives way to the initials, never
 * a broken image.
 */
export function PersonAvatar({
  name,
  fallback,
  src,
  size = "sm",
  badge = null,
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
      {badge}
    </span>
  );
}
