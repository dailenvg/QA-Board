"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { duration, fadeOnly } from "@/lib/motion";
import { clientApi } from "@/lib/share-client/api";
import type { ClientBrand } from "@/lib/share/types";
import { MonogramTile } from "../brand/MonogramTile";
import { SquintMark } from "../brand/SquintMark";
import { Skeleton } from "../ui/Skeleton";
import { accentStyle } from "./brand-accent";

interface BrandMarkProps {
  token: string;
  brand: ClientBrand;
}

interface BrandFrameProps {
  brand: Pick<ClientBrand, "custom" | "name" | "color">;
  /** The logo's URL; null shows the fallback. */
  logoSrc: string | null;
}

type LogoState = "loading" | "ready" | "broken";

interface CompanyLogoProps {
  src: string;
  fallback: ReactNode;
  /** A hairline round the backing, for a frame with no brand ring to edge it (one edge, not two). */
  edged: boolean;
}

/** The company's logo on its light backing, fading in once it's decoded; `fallback` if it won't load. */
function CompanyLogo({ src, fallback, edged }: CompanyLogoProps) {
  const [state, setState] = useState<LogoState>("loading");
  if (state === "broken") return fallback;
  return (
    <>
      {/* Fades out as the logo fades in, so the frame never flashes empty between them. */}
      <AnimatePresence initial={false}>
        {state === "loading" ? (
          <motion.span
            key="skeleton"
            variants={fadeOnly}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0"
          >
            <Skeleton className="size-full rounded-pill" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {/*
       * On a light backing, so a dark logo with no background still shows on dark surfaces.
       * Inset 8px: a square logo's corners stay inside the circle instead of being cut off.
       */}
      <motion.span
        className={`size-full rounded-pill bg-logo-bg ${edged ? "ring-1 ring-line ring-inset" : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: state === "ready" ? 1 : 0 }}
        transition={{ duration: duration.micro }}
      >
        <Image
          src={src}
          alt=""
          width={40}
          height={40}
          unoptimized
          data-testid="brand-logo"
          className="size-full object-contain p-2"
          onLoad={() => setState("ready")}
          onError={() => setState("broken")}
        />
      </motion.span>
    </>
  );
}

/**
 * The logo frame, ringed in the company's color: its logo at `logoSrc`;
 * without one (or if it won't load) the company's monogram, or the Squint
 * mark on an anonymous link. Decorative: the company's name always sits
 * beside it. The account settings' preview draws it too.
 */
export function BrandFrame({ brand, logoSrc }: BrandFrameProps) {
  const fallback = brand.custom ? (
    <MonogramTile
      name={brand.name}
      color={brand.color}
      className="size-full text-body"
      testId="brand-monogram"
    />
  ) : (
    <SquintMark className="size-7" />
  );
  return (
    <span
      style={accentStyle(brand.color)}
      data-testid="brand-mark"
      className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-pill bg-card shadow-seg ${brand.color ? "ring-2 ring-guest-accent dark:ring-guest-accent-dark" : ""}`}
    >
      {logoSrc ? (
        <CompanyLogo key={logoSrc} src={logoSrc} fallback={fallback} edged={!brand.color} />
      ) : (
        fallback
      )}
    </span>
  );
}

/** A shared link's logo frame: the company's logo, read through the link's token. */
export function BrandMark({ token, brand }: BrandMarkProps) {
  const logo =
    brand.hasLogo && brand.logoVersion ? clientApi(token).logoUrl(brand.logoVersion) : null;
  return <BrandFrame brand={brand} logoSrc={logo} />;
}
