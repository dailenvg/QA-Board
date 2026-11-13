import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { StateArt } from "@/components/ui/line-art/StateArt";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-panel bg-panel px-6 py-12 text-center">
        <StateArt scene="notFound" />
        <p className="label-caps text-brand-text">404</p>
        <h1 className="text-display font-bold">Page not found</h1>
        <p className="text-nav text-muted">
          It may have moved, or it only exists on preview deployments.
        </p>
        <ButtonLink href="/">Back to Overview</ButtonLink>
      </div>
    </main>
  );
}
