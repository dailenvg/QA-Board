"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { duration, fadeOnly } from "@/lib/motion";
import { Skeleton } from "../ui/Skeleton";

interface LogoImageProps {
  src: string;
  /** What stands in if it won't load (a monogram). */
  fallback: ReactNode;
  testId?: string;
}

type LogoState = "loading" | "ready" | "broken";

/**
 * A workspace's logo, filling its frame (cropped to the frame's shape, which
 * clips it), fading in once it's decoded; `fallback` if it won't load. The
 * file itself stays whole: only the display crops. A light backing shows
 * through a logo's transparent parts, so a dark logo still reads on dark surfaces.
 */
export function LogoImage({ src, fallback, testId }: LogoImageProps) {
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
            <Skeleton className="size-full rounded-none" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {/* relative: stacks above the absolute skeleton even once its opacity reaches 1. */}
      <motion.span
        className="relative size-full bg-logo-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: state === "ready" ? 1 : 0 }}
        transition={{ duration: duration.micro }}
      >
        <Image
          src={src}
          alt=""
          width={96}
          height={96}
          unoptimized
          data-testid={testId}
          className="block size-full object-cover"
          onLoad={() => setState("ready")}
          onError={() => setState("broken")}
        />
      </motion.span>
    </>
  );
}
