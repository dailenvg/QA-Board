"use client";

import Image from "next/image";
import { useState } from "react";
import { BlobImage } from "../ui/BlobImage";
import type { ProjectSource } from "@/lib/store/types";
import { displayHost, faviconUrl } from "@/lib/url";
import { Icon } from "../ui/Icon";

interface ProjectThumbnailProps {
  source: ProjectSource;
}

/** Card preview: the image itself, or a browser-window card with the site's favicon. */
export function ProjectThumbnail({ source }: ProjectThumbnailProps) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-tile bg-card">
      {source.kind === "image" ? (
        <BlobImage
          blobKey={source.blobKey}
          alt=""
          fill
          sizes="(min-width: 1024px) 25vw, 100vw"
          className="object-cover object-top"
          fallback={
            <span className="grid h-full place-items-center text-muted">
              <Icon name="image" className="size-6" />
            </span>
          }
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
      <div aria-hidden="true" className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="size-2 rounded-pill bg-line-strong" />
        <span className="size-2 rounded-pill bg-line-strong" />
        <span className="size-2 rounded-pill bg-line-strong" />
        <span className="ml-2 h-4 flex-1 rounded-pill bg-tile" />
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
