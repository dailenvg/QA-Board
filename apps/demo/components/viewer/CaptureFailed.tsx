"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { StateArt } from "../ui/line-art/StateArt";
import { ScreenshotUpload } from "./ScreenshotUpload";
import type { ScreenshotHandler } from "./types";

interface CaptureFailedProps {
  message: string;
  /** The site showed a login page: nothing went wrong, but there's nothing to review either. */
  loginPage: boolean;
  onRetry: () => void;
  onScreenshot: ScreenshotHandler | null;
  onBrowse: () => void;
}

const COPY = {
  failed: {
    scene: "camera",
    title: "We couldn't take a snapshot",
    retry: "Retry",
    upload: "Upload a screenshot instead",
  },
  loginPage: {
    scene: "locked",
    title: "This site is behind a login",
    retry: "Try again",
    upload: "Upload a screenshot",
  },
} as const;

/**
 * Shown instead of the snapshot when the first capture of a site fails, or
 * lands on a login page. A screenshot is the way past a login, so there it
 * leads (for the owner, the only one who can upload).
 */
export function CaptureFailed({
  message,
  loginPage,
  onRetry,
  onScreenshot,
  onBrowse,
}: CaptureFailedProps) {
  const variants = useRevealVariants();
  const copy = loginPage ? COPY.loginPage : COPY.failed;
  const uploadFirst = loginPage && onScreenshot !== null;
  const upload = onScreenshot ? (
    <ScreenshotUpload
      label={copy.upload}
      variant={uploadFirst ? "primary" : "secondary"}
      onImage={onScreenshot}
    />
  ) : null;
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      data-testid="capture-failed"
      data-reason={loginPage ? "login-page" : "failed"}
      className="grid min-h-80 place-items-center py-6 text-center"
    >
      <div className="flex max-w-md flex-col items-center gap-4">
        <StateArt scene={copy.scene} surface="tile" />
        {/* Only the message is the alert, so the buttons aren't read out as part of it. */}
        <div role="alert">
          <h2 className="text-title font-bold">{copy.title}</h2>
          <p className="mt-2 text-body text-muted">{message}</p>
        </div>
        <div className="flex flex-wrap items-start justify-center gap-2">
          {uploadFirst ? upload : null}
          <Button variant={uploadFirst ? "secondary" : "primary"} onClick={onRetry}>
            <Icon name="refresh" className="size-4" />
            {copy.retry}
          </Button>
          {uploadFirst ? null : upload}
        </div>
        <Button variant="ghost" size="sm" onClick={onBrowse}>
          <Icon name="pointer" className="size-4" />
          Back to Browse
        </Button>
      </div>
    </motion.div>
  );
}
