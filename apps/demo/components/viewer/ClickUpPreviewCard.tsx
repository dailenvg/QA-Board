"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import { duration, fadeOnly, usePopVariants } from "@/lib/motion";
import { Skeleton } from "../ui/Skeleton";

interface ClickUpPreviewCardProps {
  /** The project link's card (`/p/<id>/opengraph-image`): what ClickUp unfurls the link into. */
  src: string;
  alt: string;
}

type CardState = "loading" | "ready" | "broken";

/**
 * The link's card in the message preview, as ClickUp unfurls it: the same
 * image link previews get, at the card's own shape, a skeleton until it's
 * decoded. If it won't load, it leaves the preview (the message still reads
 * whole without it).
 */
export function ClickUpPreviewCard({ src, alt }: ClickUpPreviewCardProps) {
  const pop = usePopVariants();
  const [state, setState] = useState<CardState>("loading");
  return (
    <AnimatePresence initial={false}>
      {state === "broken" ? null : (
        <motion.div
          key="card"
          variants={pop}
          initial="visible"
          animate="visible"
          exit="exit"
          className="relative aspect-[40/21] w-full max-w-sm overflow-hidden rounded-field bg-card ring-1 ring-line"
          data-testid="clickup-preview-card"
          data-state={state}
        >
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
          <motion.span
            className="relative block size-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: state === "ready" ? 1 : 0 }}
            transition={{ duration: duration.micro }}
          >
            <Image
              src={src}
              alt={alt}
              width={1200}
              height={630}
              unoptimized
              className="block size-full object-cover"
              onLoad={() => setState("ready")}
              onError={() => setState("broken")}
            />
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
