"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { SquintMascot } from "../brand/mascot/SquintMascot";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ScreenshotUpload } from "./ScreenshotUpload";
import type { ScreenshotHandler } from "./types";

interface CaptureFailedProps {
  message: string;
  onRetry: () => void;
  onScreenshot: ScreenshotHandler | null;
  onBrowse: () => void;
}

/** Shown instead of the snapshot when the first capture of a site fails. */
export function CaptureFailed({ message, onRetry, onScreenshot, onBrowse }: CaptureFailedProps) {
  const variants = useRevealVariants();
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      data-testid="capture-failed"
      className="grid min-h-80 place-items-center py-6 text-center"
    >
      <div className="flex max-w-md flex-col items-center gap-4">
        <SquintMascot mood="surprised" size={112} />
        {/* Only the message is the alert, so the buttons aren't read out as part of it. */}
        <div role="alert">
          <h2 className="text-title font-bold">We couldn&apos;t take a snapshot</h2>
          <p className="mt-2 text-body text-muted">{message}</p>
        </div>
        <div className="flex flex-wrap items-start justify-center gap-2">
          <Button onClick={onRetry}>
            <Icon name="refresh" className="size-4" />
            Retry
          </Button>
          {onScreenshot ? (
            <ScreenshotUpload
              label="Upload a screenshot instead"
              variant="secondary"
              onImage={onScreenshot}
            />
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onBrowse}>
          <Icon name="pointer" className="size-4" />
          Back to Browse
        </Button>
      </div>
    </motion.div>
  );
}
