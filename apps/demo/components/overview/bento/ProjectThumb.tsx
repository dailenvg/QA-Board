"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProjectSource } from "@/lib/store/types";
import { faviconUrl } from "@/lib/url";
import { BlobImage } from "../../ui/BlobImage";
import { Icon } from "../../ui/Icon";
import { Skeleton } from "../../ui/Skeleton";

interface ProjectThumbProps {
  source: ProjectSource;
  /** As `ProjectThumbnail`'s: a page project's first page, or a website's latest snapshot. */
  previewKey: string | null;
}

/** While the picture is read from storage, so the missing-image square doesn't flash first. */
const PENDING = <Skeleton className="size-full rounded-none" />;

/**
 * A project's picture as a small square for a tile's row: `ProjectThumbnail`'s
 * picture, cropped from the top. A website without a snapshot shows its
 * favicon (on the light chip favicons are drawn for), else a globe; a page
 * that can't be read shows the image icon. Decorative: the row names it.
 */
export function ProjectThumb({ source, previewKey }: ProjectThumbProps) {
  const fallback = source.kind === "url" ? <Favicon url={source.url} /> : <NoImage />;
  return (
    <span
      aria-hidden="true"
      className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-field bg-card ring-1 ring-line"
    >
      {previewKey ? (
        <BlobImage
          blobKey={previewKey}
          alt=""
          fill
          sizes="40px"
          className="object-cover object-top"
          pending={PENDING}
          fallback={fallback}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

function NoImage() {
  return <Icon name="image" className="size-5 text-muted" />;
}

function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const icon = faviconUrl(url);
  if (!icon || failed) return <Icon name="globe" className="size-5 text-muted" />;
  return (
    <span className="grid size-full place-items-center bg-favicon-bg">
      <Image
        src={icon}
        alt=""
        width={20}
        height={20}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
