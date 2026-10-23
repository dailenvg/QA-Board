import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type CopyState = "idle" | "copied" | "failed";

const RESET_MS = 2000;
const LABELS: Record<CopyState, string> = {
  idle: "Copy link",
  copied: "Link copied",
  failed: "Copy failed",
};

interface CopyLinkButtonProps {
  url: string;
}

/** Copies a deep link to the clipboard with inline success and failure feedback. */
export function CopyLinkButton({ url }: CopyLinkButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), RESET_MS);
  };

  return (
    <button type="button" className="pp-btn pp-btn--secondary" onClick={() => void copy()}>
      <Icon name={state === "copied" ? "check" : state === "failed" ? "alert" : "link"} />
      <span aria-live="polite">{LABELS[state]}</span>
    </button>
  );
}
