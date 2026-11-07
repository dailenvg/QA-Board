"use client";

import type { LocalCounts } from "@/lib/workspace-client/use-local-import";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ImportActions } from "./ImportActions";
import { ImportStep } from "./ImportStep";
import { offerDetail } from "./import-copy";

interface ImportOfferProps {
  counts: LocalCounts;
  onImport: () => void;
  onLater: () => void;
  onDiscard: () => void;
}

/** "Import N projects into {workspace}?": Import, Not now (asks again next sign-in), or Discard. */
export function ImportOffer({ counts, onImport, onLater, onDiscard }: ImportOfferProps) {
  return (
    <ImportStep testId="import-offer">
      <p className="flex items-start gap-2 rounded-card bg-card px-4 py-3 text-body text-ink-2">
        <Icon name="upload" className="mt-0.5 size-4 shrink-0 text-muted" />
        {offerDetail(counts)}
      </p>
      <ImportActions
        aside={
          <Button variant="ghost" size="sm" onClick={onDiscard} data-testid="import-discard">
            Discard local data
          </Button>
        }
      >
        <Button variant="secondary" onClick={onLater} data-testid="import-later">
          Not now
        </Button>
        <Button onClick={onImport} data-autofocus data-testid="import-start">
          Import
        </Button>
      </ImportActions>
    </ImportStep>
  );
}
