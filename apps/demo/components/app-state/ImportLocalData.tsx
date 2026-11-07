"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import {
  askDiscard,
  cancelDiscard,
  checkLocalData,
  discardLocalData,
  finishImport,
  importLater,
  startImport,
  useLocalImport,
  type LocalImportState,
} from "@/lib/workspace-client/use-local-import";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/ToastProvider";
import { DiscardConfirm } from "./import/DiscardConfirm";
import { ImportFailed } from "./import/ImportFailed";
import { ImportOffer } from "./import/ImportOffer";
import { ImportProgressView } from "./import/ImportProgressView";
import { ImportSummary } from "./import/ImportSummary";
import { UnreadableLocalData } from "./import/UnreadableLocalData";
import { dialogText } from "./import/import-copy";

interface ImportLocalDataProps {
  workspaceId: string;
  workspaceName: string;
}

type Shown = Exclude<LocalImportState, { view: "hidden" }>;

/** What Escape, the backdrop and the close button do in each view; null where the dialog stays. */
function closeAction(state: Shown): (() => void) | null {
  switch (state.view) {
    case "offer":
    case "unreadable":
    case "failed":
      return importLater;
    case "done":
      return finishImport;
    case "confirm-discard":
      return cancelDiscard;
    case "importing":
    case "discarding":
      return null;
  }
}

/** The key AnimatePresence swaps views by: the discarding view is the confirm view, busy. */
const stepKey = (state: Shown) => (state.view === "discarding" ? "confirm-discard" : state.view);

/** A view's title and description as one sentence pair for the live region. */
function spoken({ title, description }: { title: string; description: string }): string {
  return /[.?!…]$/.test(title) ? `${title} ${description}` : `${title}. ${description}`;
}

/**
 * Offers, once per sign-in, to import the projects an earlier build kept in
 * this browser into the signed-in workspace; never imports or clears without
 * a click. Mounted in `WorkspaceProvider`, so only a member of a workspace
 * ever sees it. Views: the offer, progress, a failure with Retry, the
 * summary, an unreadable store, and the Discard confirmation.
 */
export function ImportLocalData({ workspaceId, workspaceName }: ImportLocalDataProps) {
  const state = useLocalImport();
  const toast = useToast();
  // The last view shown, so the dialog keeps its content while it animates out.
  const [shown, setShown] = useState<Shown | null>(null);
  if (state.view !== "hidden" && state !== shown) setShown(state);
  // The first view is read as the dialog opens. Each later one replaces the focused control and
  // moves focus to its own, which is all a screen reader would say: announce its title and
  // description too, so a failure's reason or the summary isn't missed.
  const key = state.view === "hidden" ? null : stepKey(state);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  if (key !== lastKey) {
    setLastKey(key);
    setAnnouncement(
      lastKey !== null && state.view !== "hidden" ? spoken(dialogText(state, workspaceName)) : "",
    );
  }

  useEffect(() => {
    checkLocalData();
  }, []);

  if (!shown) return null;
  const close = closeAction(shown);
  const discard = async () => {
    await discardLocalData();
    toast({ message: "Removed the projects saved in this browser." });
  };
  const { title, description } = dialogText(shown, workspaceName);

  return (
    <Dialog
      open={state.view !== "hidden"}
      onClose={close ?? (() => undefined)}
      dismissible={close !== null}
      title={title}
      description={description}
      testId="import-dialog"
    >
      {/* Always present, so each change is announced. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        {shown.view === "offer" ? (
          <ImportOffer
            key={stepKey(shown)}
            counts={shown.counts}
            onImport={() => void startImport(workspaceId)}
            onLater={importLater}
            onDiscard={askDiscard}
          />
        ) : shown.view === "importing" ? (
          <ImportProgressView key={stepKey(shown)} progress={shown.progress} />
        ) : shown.view === "failed" ? (
          <ImportFailed
            key={stepKey(shown)}
            failure={shown.failure}
            workspace={workspaceName}
            onRetry={() => void startImport(workspaceId)}
            onLater={importLater}
            onDiscard={askDiscard}
          />
        ) : shown.view === "done" ? (
          <ImportSummary
            key={stepKey(shown)}
            report={shown.report}
            onDone={finishImport}
            onDiscard={askDiscard}
          />
        ) : shown.view === "unreadable" ? (
          <UnreadableLocalData
            key={stepKey(shown)}
            raw={shown.raw}
            onLater={importLater}
            onDiscard={askDiscard}
          />
        ) : (
          <DiscardConfirm
            key={stepKey(shown)}
            busy={shown.view === "discarding"}
            onCancel={cancelDiscard}
            onConfirm={() => void discard()}
          />
        )}
      </AnimatePresence>
    </Dialog>
  );
}
