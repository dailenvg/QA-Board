import { useIsClient } from "@/lib/use-is-client";

const DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/**
 * `at` as a date ("Dec 10, 2026"), in this browser's locale and time zone.
 * The server, and hydration, use US English in UTC, so both render the same
 * text before the browser's own takes over.
 */
export function useDeleteDate(at: number): string {
  const isClient = useIsClient();
  const date = new Date(at);
  return isClient
    ? date.toLocaleDateString(undefined, DATE)
    : date.toLocaleDateString("en-US", { ...DATE, timeZone: "UTC" });
}
