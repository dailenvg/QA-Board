import { PinpointProvider } from "@pinpoint/widget/next";
import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: `${SITE.name} · ${SITE.tagline}`,
  description:
    "Open source, self-hosted visual feedback for Vercel preview deployments. Click to pin a comment; it lands in the pull request.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

/** `NEXT_PUBLIC_PINPOINT_ENABLED=1` forces the widget on outside Vercel previews (local dev). */
const forceWidget = process.env.NEXT_PUBLIC_PINPOINT_ENABLED === "1" ? true : undefined;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only rounded-control bg-accent px-5 py-3 text-on-accent focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
        >
          Skip to content
        </a>
        <PinpointProvider {...(forceWidget ? { enabled: true } : {})}>{children}</PinpointProvider>
      </body>
    </html>
  );
}
