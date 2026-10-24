"use client";

import { useState } from "react";
import { useBlobSource, type BlobSource } from "@/lib/blob-store/blob-source";
import { exportProject, type ExportFormat } from "@/lib/export/export-project";
import type { Project, SquintData } from "@/lib/store/types";
import { buttonClass } from "../ui/button-styles";
import { Menu } from "../ui/Menu";
import { useToast, type ToastInput } from "../ui/ToastProvider";

interface ExportMenuProps {
  data: SquintData;
  project: Project;
  commentCount: number;
}

const NO_COMMENTS = "Add a comment first. There's nothing to export yet.";
const BUSY = "Preparing your export…";

interface ExportRun {
  data: SquintData;
  project: Project;
  format: ExportFormat;
  blobs: BlobSource;
  toast: (toast: ToastInput) => void;
  setBusy: (busy: boolean) => void;
}

/**
 * One export, reported by toast. A module-level function, so the failure
 * toast's Retry can call it again without a component closure referring to itself.
 */
function runExport(job: ExportRun): void {
  const { data, project, format, blobs, toast, setBusy } = job;
  setBusy(true);
  exportProject(data, project, format, blobs)
    .then((fileName) => toast({ message: `Downloaded ${fileName}` }))
    .catch(() =>
      toast({
        tone: "error",
        message: "The export didn't work.",
        action: { label: "Retry", onAction: () => runExport(job) },
      }),
    )
    .finally(() => setBusy(false));
}

/** Top-bar Export menu: a ZIP with screenshots, or bare Markdown or JSON. */
export function ExportMenu({ data, project, commentCount }: ExportMenuProps) {
  const toast = useToast();
  const blobs = useBlobSource();
  const [busy, setBusy] = useState(false);

  const run = (format: ExportFormat) => runExport({ data, project, format, blobs, toast, setBusy });

  return (
    <>
      <Menu
        // While busy the name says so too, not only the status message.
        label={busy ? "Exporting comments…" : "Export comments"}
        icon="download"
        text={busy ? "Exporting…" : "Export"}
        testId="export-menu"
        disabledReason={commentCount === 0 ? NO_COMMENTS : busy ? BUSY : null}
        // Phones: the popup anchors to the top bar's right edge, not the trigger, so it can't
        // run off the left side of a 375px screen.
        className="max-sm:static"
        triggerClassName={`${buttonClass("secondary", "sm")} max-sm:size-11 max-sm:px-0`}
        items={[
          {
            label: "ZIP (Markdown + JSON + screenshots)",
            icon: "fileArchive",
            onSelect: () => run("zip"),
          },
          { label: "Markdown", icon: "fileText", onSelect: () => run("markdown") },
          { label: "JSON", icon: "fileJson", onSelect: () => run("json") },
        ]}
      />
      {/* The trigger's name stays "Export comments"; this tells screen readers work started. */}
      <span role="status" className="sr-only">
        {busy ? BUSY : ""}
      </span>
    </>
  );
}
