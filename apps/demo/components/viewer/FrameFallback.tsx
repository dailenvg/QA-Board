"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { displayHost } from "@/lib/url";
import { Squiggy } from "../brand/mascot/Squiggy";
import { Button } from "../ui/Button";
import { buttonClass } from "../ui/button-styles";
import { Icon } from "../ui/Icon";
import { ScreenshotUpload } from "./ScreenshotUpload";
import type { ScreenshotHandler } from "./types";

export type FallbackReason = "blocked" | "unreachable" | "timeout";

interface FrameFallbackProps {
  reason: FallbackReason;
  url: string;
  onScreenshot: ScreenshotHandler | null;
  /** Secondary recovery: check again, or load the frame regardless. */
  onRetry: () => void;
}

/** `canUpload` is false on a shared link, where clients have no screenshot upload. */
function copyFor(reason: FallbackReason, host: string, canUpload: boolean) {
  switch (reason) {
    case "blocked":
      return {
        title: "This site can't be shown here",
        body: canUpload
          ? `${host} tells browsers not to display it inside other sites. Upload a screenshot to review it in Squint, or open it in a new tab.`
          : `${host} tells browsers not to display it inside other sites. Switch to Comment mode to comment on a snapshot, or open it in a new tab.`,
        retry: "Check again",
      };
    case "unreachable":
      return {
        title: "We couldn't reach this site",
        body: canUpload
          ? `${host} didn't respond to our check. It may be private, offline or behind a login. Try loading it anyway, or upload a screenshot.`
          : `${host} didn't respond to our check. It may be private, offline or behind a login. Try loading it anyway, or open it in a new tab.`,
        retry: "Try loading anyway",
      };
    case "timeout":
      return {
        title: "This site is taking a while",
        body: canUpload
          ? `${host} hasn't finished loading. It may block embedding without saying so. Keep waiting, or upload a screenshot instead.`
          : `${host} hasn't finished loading. It may block embedding without saying so. Keep waiting, or switch to Comment mode to comment on a snapshot.`,
        retry: "Keep waiting",
      };
  }
}

/** Shown instead of the iframe when a site refuses framing, can't be reached, or stalls. */
export function FrameFallback({ reason, url, onScreenshot, onRetry }: FrameFallbackProps) {
  const variants = useRevealVariants();
  const copy = copyFor(reason, displayHost(url), onScreenshot !== null);
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      role="alert"
      data-testid="frame-fallback"
      data-reason={reason}
      className="absolute inset-0 z-[6] grid place-items-center overflow-y-auto bg-tile p-6 text-center"
    >
      <div className="flex max-w-md flex-col items-center gap-4">
        <Squiggy mood={reason === "timeout" ? "thinking" : "surprised"} size={112} />
        <div>
          <h2 className="text-title font-bold">{copy.title}</h2>
          <p className="mt-2 text-body text-muted">{copy.body}</p>
        </div>
        <div className="flex flex-wrap items-start justify-center gap-2">
          {onScreenshot ? (
            <ScreenshotUpload label="Upload a screenshot instead" onImage={onScreenshot} />
          ) : null}
          <a href={url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Icon name="external" className="size-4" />
            Open site in new tab
          </a>
        </div>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <Icon name="refresh" className="size-4" />
          {copy.retry}
        </Button>
      </div>
    </motion.div>
  );
}
