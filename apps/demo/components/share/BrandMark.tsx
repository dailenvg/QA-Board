"use client";

import { clientApi } from "@/lib/share-client/api";
import type { ClientBrand } from "@/lib/share/types";
import { CompanyMark } from "../avatar/CompanyMark";
import { LogoImage } from "../brand/LogoImage";
import { SquintMark } from "../brand/SquintMark";
import { accentStyle } from "./brand-accent";

interface BrandMarkProps {
  token: string;
  brand: ClientBrand;
}

interface BrandFrameProps {
  brand: Pick<ClientBrand, "custom" | "color">;
  /** The logo's URL; null shows the fallback. */
  logoSrc: string | null;
}

/** The frame's side (`size-10`), in CSS px. */
const FRAME_PX = 40;

/** One edge round the frame: the brand ring, else a hairline round a logo, else none. */
function frameEdge(color: string | null, hasLogo: boolean): string {
  if (color) return "ring-2 ring-guest-accent dark:ring-guest-accent-dark";
  return hasLogo ? "ring-1 ring-line" : "";
}

/**
 * The logo frame, ringed in the company's color: its logo at `logoSrc`,
 * filling the circle; without one (or if it won't load) the company's
 * default mark, sized to clear the circle, or the Squint mark on an
 * anonymous link. Decorative: the company's name always sits beside it. The
 * account settings' preview draws it too.
 */
export function BrandFrame({ brand, logoSrc }: BrandFrameProps) {
  const fallback = brand.custom ? (
    <CompanyMark color={brand.color} size={FRAME_PX} fit="circle" testId="brand-default" />
  ) : (
    <SquintMark className="size-7" />
  );
  return (
    <span
      style={accentStyle(brand.color)}
      data-testid="brand-mark"
      className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-pill bg-card shadow-seg ${frameEdge(brand.color, logoSrc !== null)}`}
    >
      {logoSrc ? (
        <LogoImage key={logoSrc} src={logoSrc} fallback={fallback} testId="brand-logo" />
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
