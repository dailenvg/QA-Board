import { useEffect, useState } from "react";

/**
 * An object URL for `blob` while the component is mounted, revoked when the
 * blob changes or the component unmounts. Null for a frame while it's made.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const frame = requestAnimationFrame(() => setEntry({ blob, url }));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return entry && entry.blob === blob ? entry.url : null;
}
