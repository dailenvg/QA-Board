import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { CopyLinkField } from "@/components/review-link/CopyLinkField";
import { Icon } from "@/components/ui/Icon";
import { buildReviewUrl, deploymentOrigin, reviewLinkEnabled } from "@/lib/review-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Review link",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ReviewLinkPage() {
  if (!reviewLinkEnabled()) notFound();
  const token = process.env.PINPOINT_REVIEW_TOKEN;
  const url = token ? buildReviewUrl(await deploymentOrigin(), token) : null;

  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-2xl rounded-panel bg-panel p-6 sm:p-10">
        <Logo caption="Visual review" />
        <p className="label-caps mt-10 text-brand-text">Preview only</p>
        <h1 className="mt-3 text-display font-bold text-balance">Share this preview for review</h1>
        <p className="mt-4 text-nav text-muted">
          Anyone who opens this link can pin comments on the preview. The token is remembered in
          their browser for 14 days and removed from the address bar.
        </p>

        {url ? (
          <CopyLinkField url={url} />
        ) : (
          <p
            role="status"
            className="mt-8 flex gap-3 rounded-card bg-comments-soft p-5 text-body text-comments-text"
            data-testid="review-link-missing-token"
          >
            <Icon name="alert" className="size-5 shrink-0" />
            No review token is set. Set PINPOINT_REVIEW_TOKEN on this deployment to generate a
            review link.
          </p>
        )}

        <p className="mt-8 border-t border-line pt-5 text-meta text-muted">
          The token gates the pinpoint API, not the page. Keep previews behind Vercel Deployment
          Protection if the work is private.
        </p>
      </div>
    </main>
  );
}
