import { PinpointProvider } from "@pinpoint/widget/next";
import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Squint", template: "%s · Squint" },
  description:
    "Visual review for websites and images. Drop a pin anywhere, leave a comment, and resolve it when it's done.",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR.light,
};

/** `NEXT_PUBLIC_PINPOINT_ENABLED=1` forces the widget on outside Vercel previews (local dev). */
const forceWidget = process.env.NEXT_PUBLIC_PINPOINT_ENABLED === "1" ? true : undefined;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script may switch data-theme before hydration.
    <html lang="en" data-theme="light" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only rounded-pill bg-brand px-5 py-3 font-semibold text-on-brand focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
        >
          Skip to content
        </a>
        <PinpointProvider {...(forceWidget ? { enabled: true } : {})}>
          <ToastProvider>{children}</ToastProvider>
        </PinpointProvider>
      </body>
    </html>
  );
}
