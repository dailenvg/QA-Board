import { useEffect, useRef, type RefObject } from "react";
import { readLocationMessage } from "./message";

/**
 * Follows a cooperating site around inside the review's iframe: calls
 * `onLocation` with each same-origin page it reports (see `readLocationMessage`).
 * Sites that don't post anything are simply never followed.
 */
export function useFrameLocation(
  frameRef: RefObject<HTMLIFrameElement | null>,
  projectUrl: string,
  onLocation: ((pageUrl: string) => void) | null,
): void {
  const onLocationRef = useRef(onLocation);
  useEffect(() => {
    onLocationRef.current = onLocation;
  });
  const listening = onLocation !== null;

  useEffect(() => {
    if (!listening) return;
    const onMessage = (event: MessageEvent) => {
      const page = readLocationMessage(event, frameRef.current?.contentWindow ?? null, projectUrl);
      if (page) onLocationRef.current?.(page);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef, projectUrl, listening]);
}
