"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { BlobSourceContext } from "@/lib/blob-store/blob-source";
import { createClientBackend } from "@/lib/share-client/client-backend";
import { createClientStore, toViewerData } from "@/lib/share-client/client-store";
import { createDraftStorage } from "@/lib/share-client/draft-storage";
import { createServerBlobs } from "@/lib/share-client/server-blobs";
import { useClientRefresh } from "@/lib/share-client/use-client-refresh";
import type { ClientView } from "@/lib/share/types";
import { ViewerBackendContext } from "@/lib/viewer-backend/backend";
import { Logo } from "../brand/Logo";
import { Icon } from "../ui/Icon";
import { useIsClient } from "@/lib/use-is-client";
import { ViewerSkeleton } from "../viewer/ViewerSkeleton";
import { ViewerView } from "../viewer/ViewerView";
import { ShareUnavailable } from "./ShareUnavailable";

interface SharedReviewProps {
  token: string;
  initial: ClientView;
}

/** The phone version, under the comments sheet's header. */
const CLIENT_NOTE = "You can add comments. Only the project owner can resolve or edit them.";

const CLIENT_NOTICE =
  "You can browse this project and add comments. Only the project owner can resolve, edit or delete them.";

/**
 * A client's view of a shared project: the same viewer, reading from and
 * writing to the share's server, without moderation controls or any link
 * into a workspace. Nothing is saved to this browser's Squint workspace.
 */
export function SharedReview({ token, initial }: SharedReviewProps) {
  const [store] = useState(() => createClientStore(initial));
  const [blobs] = useState(() => createServerBlobs(token));
  const backend = useMemo(
    () => createClientBackend({ token, store, blobs }),
    [token, store, blobs],
  );
  const draftStorage = useMemo(() => createDraftStorage(token), [token]);
  // Client-only: an unsent draft is restored from this tab's sessionStorage on first render.
  const isClient = useIsClient();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { data, project } = useMemo(() => toViewerData(state), [state]);
  useClientRefresh(token, store);

  if (state.gone) return <ShareUnavailable />;
  if (!isClient) return <ViewerSkeleton />;
  return (
    <BlobSourceContext value={blobs}>
      <ViewerBackendContext value={backend}>
        <ViewerView
          data={data}
          project={project}
          leading={
            <span className="pl-2">
              <Logo linked={false} caption="Shared review" compact />
            </span>
          }
          panelNote={CLIENT_NOTE}
          draftStorage={draftStorage}
          panelNotice={
            <p
              data-testid="client-notice"
              className="mx-3 flex items-start gap-2 rounded-tile bg-card px-4 py-3 text-meta text-muted"
            >
              <Icon name="message" className="mt-0.5 size-4 shrink-0 text-ink-2" />
              {CLIENT_NOTICE}
            </p>
          }
        />
      </ViewerBackendContext>
    </BlobSourceContext>
  );
}
