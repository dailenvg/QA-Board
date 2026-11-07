"use client";

import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ImportActions } from "./ImportActions";
import { ImportStep } from "./ImportStep";

interface UnreadableLocalDataProps {
  /** The stored data as it is, for the download. */
  raw: string;
  onLater: () => void;
  onDiscard: () => void;
}

const FILE_NAME = "squint-local-data.json";

/** Saves the unreadable data as a file, so it can be recovered before it's discarded. */
function download(raw: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = FILE_NAME;
  link.click();
  // Revoked once the download has had its turn.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** This browser's data can't be read: never cleared on its own. Keep it, download a copy, or discard it. */
export function UnreadableLocalData({ raw, onLater, onDiscard }: UnreadableLocalDataProps) {
  return (
    <ImportStep testId="import-unreadable">
      <p className="text-body text-ink-2">
        Keep it for now and try again later, or download a copy before you discard it.
      </p>
      <ImportActions
        aside={
          <Button variant="ghost" size="sm" onClick={onDiscard} data-testid="import-discard">
            Discard local data
          </Button>
        }
      >
        <Button variant="secondary" onClick={() => download(raw)} data-testid="import-download">
          <Icon name="download" className="size-4" />
          Download a copy
        </Button>
        <Button onClick={onLater} data-autofocus data-testid="import-later">
          Keep for now
        </Button>
      </ImportActions>
    </ImportStep>
  );
}
