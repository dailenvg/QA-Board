import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyLinkField } from "@/components/review-link/CopyLinkField";
import { Logo } from "@/components/site/Logo";
import { Icon } from "@/components/ui/Icon";
import { buildReviewUrl, deploymentOrigin, reviewLinkEnabled } from "@/lib/review-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Review link · pinpoint",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ReviewLinkPage() {
  if (!reviewLinkEnabled()) notFound();
  const token = process.env.PINPOINT_REVIEW_TOKEN;
  const url = token ? buildReviewUrl(await deploymentOrigin(), token) : null;

  return (
    <main id="main" className="container-page grid min-h-dvh content-center py-section">
      <div className="mx-auto w-full max-w-2xl">
        <Logo />
        <p className="label-caps mt-12 text-accent">Preview only</p>
        <h1 className="mt-4 font-display text-h2 text-balance">Share this preview for review.</h1>
        <p className="mt-6 text-lead text-muted">
          Anyone who opens this link can pin comments on the preview. The token is remembered on
          their device for 14 days and removed from the address bar.
        </p>

        {url ? (
          <CopyLinkField url={url} />
        ) : (
          <p
            role="status"
            className="mt-10 flex gap-3 rounded-card bg-accent-soft p-6 text-body"
            data-testid="review-link-missing-token"
          >
            <Icon name="alert" className="size-5 shrink-0 text-accent" />
            No review token is set. Set PINPOINT_REVIEW_TOKEN on this deployment to generate a
            review link.
          </p>
        )}

        <p className="mt-10 border-t border-rule pt-6 text-small text-muted">
          The token gates the pinpoint API, not the page. Keep previews behind Vercel Deployment
          Protection if the work is private.
        </p>
      </div>
    </main>
  );
}
