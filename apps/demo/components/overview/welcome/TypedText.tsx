"use client";

import { useEffect, useState } from "react";

interface TypedTextProps {
  text: string;
  /** Milliseconds per character. */
  charMs: number;
  /** False holds the text where it is. */
  playing: boolean;
  /** Start fully typed: the finished frame. */
  instant: boolean;
}

/** Types `text` out one character at a time, with a caret while it types. Mount it to start. */
export function TypedText({ text, charMs, playing, instant }: TypedTextProps) {
  const [typed, setTyped] = useState(instant ? text.length : 0);
  const typing = typed < text.length;

  useEffect(() => {
    if (!playing || !typing) return;
    const timer = window.setTimeout(() => setTyped((count) => count + 1), charMs);
    return () => window.clearTimeout(timer);
  }, [typed, typing, playing, charMs]);

  return (
    <>
      {text.slice(0, typed)}
      {typing && (
        <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] bg-current" />
      )}
    </>
  );
}
