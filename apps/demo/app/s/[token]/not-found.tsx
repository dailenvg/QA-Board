import type { Metadata } from "next";
import { ShareUnavailable } from "@/components/share/ShareUnavailable";

export const metadata: Metadata = {
  title: "Link not available",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Unknown or revoked share token. Deliberately without links to any workspace page. */
export default function ShareNotFound() {
  return <ShareUnavailable />;
}
