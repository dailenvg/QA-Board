"use client";

import Image from "next/image";
import { useState } from "react";
import { BlobImage } from "../ui/BlobImage";
import type { ProjectSource } from "@/lib/store/types";
import { displayHost, faviconUrl } from "@/lib/url";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";

interface ProjectThumbnailProps {
  source: ProjectSource;
  /**
   * A page project's first page; a website's latest snapshot (desktop first),
   * shown instead of the favicon card once taken.
   */
  previewKey: string | null;
}

const SIZES = "(min-width: 1024px) 25vw, 100vw";
/** While the picture is read from storage, so a missing-image card doesn't flash first. */
const PENDING = <Skeleton className="size-full" />;
const NO_IMAGE = (
  <span className="grid h-full place-items-center text-muted">
    <Icon name="image" className="size-6" />
  </span>
);

/**
 * Card preview: a page project's first page; for a website, its latest
 * snapshot, or a browser-window card with the site's favicon until there is one.
 */
export function ProjectThumbnail({ source, previewKey }: ProjectThumbnailProps) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-tile bg-card">
      {source.kind === "pages" ? (
        previewKey ? (
          <BlobImage
            blobKey={previewKey}
            alt=""
            fill
            sizes={SIZES}
            className="object-cover object-top"
            pending={PENDING}
            fallback={NO_IMAGE}
          />
        ) : (
          NO_IMAGE
        )
      ) : previewKey ? (
        <BlobImage
          blobKey={previewKey}
          alt=""
          fill
          sizes={SIZES}
          className="object-cover object-top"
          pending={PENDING}
          fallback={<SiteCard url={source.url} />}
        />
      ) : (
        <SiteCard url={source.url} />
      )}
    </div>
  );
}

function SiteCard({ url }: { url: string }) {
  const [iconFailed, setIconFailed] = useState(false);
  const icon = faviconUrl(url);
  const showIcon = Boolean(icon) && !iconFailed;
  return (
    <div className="flex h-full flex-col">
      {/*
       * The card's type pill ("Website", ProjectTypeTag) sits in the bar's left end, like a
       * browser tab: min-h-10 centers it (8px inset, 24px pill, 8px) and pl-28 keeps the address
       * field clear of it. The window dots move to the right end so nothing sits under the pill.
       */}
      <div
        aria-hidden="true"
        className="flex min-h-10 items-center gap-2 border-b border-line pr-4 pl-28"
      >
        <span className="mr-2 h-4 min-w-0 flex-1 rounded-pill bg-tile" />
        <span className="size-2 shrink-0 rounded-pill bg-line-strong" />
        <span className="size-2 shrink-0 rounded-pill bg-line-strong" />
        <span className="size-2 shrink-0 rounded-pill bg-line-strong" />
      </div>
      <div className="grid flex-1 place-items-center gap-2 p-4 text-center">
        {/* Favicons are drawn for light browser chrome; a fixed light chip keeps dark ones visible in dark mode. */}
        <span
          className={`grid size-12 place-items-center overflow-hidden rounded-tile ${
            showIcon ? "bg-favicon-bg shadow-seg ring-1 ring-line" : "bg-tile text-muted"
          }`}
        >
          {icon && showIcon ? (
            <Image
              src={icon}
              alt=""
              width={28}
              height={28}
              unoptimized
              referrerPolicy="no-referrer"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <Icon name="globe" className="size-6" />
          )}
        </span>
        <span className="max-w-full truncate text-body font-semibold text-ink-2">
          {displayHost(url)}
        </span>
      </div>
    </div>
  );
}
