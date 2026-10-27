"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrameLocation } from "@/lib/frame-location/use-frame-location";
import { Skeleton } from "../ui/Skeleton";
import { FrameFallback } from "./FrameFallback";
import type { ScreenshotHandler } from "./types";

/** Long enough for slow sites; framing refusals usually surface well before this. */
const LOAD_TIMEOUT_MS = 15_000;

/** Popups and forms work; top-level navigation (frame busting) does not. */
const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

interface FrameViewProps {
  url: string;
  title: string;
  overlay: ReactNode;
  onScreenshot: ScreenshotHandler | null;
  /** In Comment mode the framed site leaves the tab order, so Tab reaches the comment canvas. */
  commentMode: boolean;
  /** The project's address: only pages on its origin are followed. */
  siteUrl: string;
  /** Called with each page the framed site reports it navigated to (see `useFrameLocation`). */
  onLocation: ((pageUrl: string) => void) | null;
}

/** The live iframe, with a loading veil and a timeout fallback. */
export function FrameView({
  url,
  title,
  overlay,
  onScreenshot,
  commentMode,
  siteUrl,
  onLocation,
}: FrameViewProps) {
  const [phase, setPhase] = useState<"loading" | "loaded" | "timeout">("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);
  useFrameLocation(frameRef, siteUrl, onLocation);

  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => setPhase("timeout"), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <>
      <iframe
        ref={frameRef}
        src={url}
        title={title}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        tabIndex={commentMode ? -1 : undefined}
        data-testid="preview-frame"
        onLoad={() => setPhase("loaded")}
        className="absolute inset-0 size-full border-0 bg-card"
      />
      {phase === "loading" ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-[4] flex flex-col gap-3 bg-card p-6"
        >
          <span className="sr-only">Loading the site…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      ) : null}
      {phase === "timeout" ? (
        <FrameFallback
          reason="timeout"
          url={url}
          onScreenshot={onScreenshot}
          onRetry={() => setPhase("loading")}
        />
      ) : (
        overlay
      )}
    </>
  );
}
