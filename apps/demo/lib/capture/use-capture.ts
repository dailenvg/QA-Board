import { useCallback, useEffect, useRef, useState } from "react";
import { deleteBlobs, putBlob } from "../blob-store/blob-store";
import { snapshotBlobKey } from "../blob-store/keys";
import { addSnapshot } from "../store/actions";
import { newId } from "../store/id";
import type { Snapshot } from "../store/types";
import { CAPTURE_MESSAGES } from "./messages";
import { requestCapture } from "./request-capture";
import { clampWidth } from "./types";

export type CaptureState =
  { status: "idle" } | { status: "capturing" } | { status: "failed"; message: string };

const IDLE: CaptureState = { status: "idle" };

/**
 * Takes snapshots of a website project: captures server-side, stores the image
 * in the blob store, then records the snapshot. A new capture cancels the one
 * in flight; leaving the viewer cancels it too.
 */
export function useCapture(
  projectId: string,
  url: string | null,
  onCaptured: (snapshot: Snapshot) => void,
): { state: CaptureState; capture: (width: number) => void } {
  const [state, setState] = useState<CaptureState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const onCapturedRef = useRef(onCaptured);
  useEffect(() => {
    onCapturedRef.current = onCaptured;
  });
  useEffect(() => () => controller.current?.abort(), []);

  const capture = useCallback(
    (width: number) => {
      if (!url) return;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setState({ status: "capturing" });
      const fail = (message: string) => {
        if (!current.signal.aborted) setState({ status: "failed", message });
      };
      void (async () => {
        const result = await requestCapture(url, clampWidth(width), current.signal);
        if (current.signal.aborted) return;
        if (!result.ok) return fail(CAPTURE_MESSAGES[result.failure]);
        const id = newId();
        const blobKey = snapshotBlobKey(id);
        if (!(await putBlob(blobKey, result.blob))) return fail(CAPTURE_MESSAGES.storage);
        const { width: pageWidth, height } = result;
        const saved = addSnapshot({
          id,
          projectId,
          width: pageWidth,
          height,
          blobKey,
          sourceUrl: url,
        });
        if (!saved.ok) {
          await deleteBlobs([blobKey]);
          return fail(saved.error);
        }
        setState(IDLE);
        onCapturedRef.current(saved.value);
      })();
    },
    [projectId, url],
  );

  return { state, capture };
}
