"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import { duration } from "@/lib/motion";
import { clientApi } from "@/lib/share-client/api";
import type { ClientBrand } from "@/lib/share/types";
import { SquintMark } from "../brand/SquintMark";
import { Skeleton } from "../ui/Skeleton";
import { accentStyle } from "./brand-accent";

interface BrandMarkProps {
  token: string;
  brand: ClientBrand;
}

type LogoState = "loading" | "ready" | "broken";

/** The company's logo through the link's token, fading in once it's decoded. */
function CompanyLogo({ src }: { src: string }) {
  const [state, setState] = useState<LogoState>("loading");
  if (state === "broken") return <SquintMark className="size-7" />;
  return (
    <>
      {state === "loading" ? <Skeleton className="absolute inset-0 rounded-pill" /> : null}
      <motion.span
        className="size-full"
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
          className="size-full object-contain p-1"
          onLoad={() => setState("ready")}
          onError={() => setState("broken")}
        />
      </motion.span>
    </>
  );
}

/**
 * The logo frame of a shared link: the company's logo when it has one (the
 * Squint mark while none, or if it won't load), ringed in the company's color.
 * Decorative: the company's name always sits beside it.
 */
export function BrandMark({ token, brand }: BrandMarkProps) {
  const logo =
    brand.hasLogo && brand.logoVersion ? clientApi(token).logoUrl(brand.logoVersion) : null;
  return (
    <span
      style={accentStyle(brand.color)}
      data-testid="brand-mark"
      className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-pill bg-card shadow-seg ${brand.color ? "ring-2 ring-guest-accent" : ""}`}
    >
      {logo ? <CompanyLogo key={logo} src={logo} /> : <SquintMark className="size-7" />}
    </span>
  );
}
