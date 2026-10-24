"use client";

import { useState } from "react";
import { useBlobSource } from "@/lib/blob-store/blob-source";
import { exportProject, type ExportFormat } from "@/lib/export/export-project";
import type { Project, SquintData } from "@/lib/store/types";
import { buttonClass } from "../ui/button-styles";
import { Menu } from "../ui/Menu";
import { useToast } from "../ui/ToastProvider";

interface ExportMenuProps {
  data: SquintData;
  project: Project;
  commentCount: number;
}

const NO_COMMENTS = "Add a comment first. Exports list a project's comments.";
const BUSY = "Preparing your export…";

/** Top-bar Export menu: a ZIP with screenshots, or bare Markdown or JSON. */
export function ExportMenu({ data, project, commentCount }: ExportMenuProps) {
  const toast = useToast();
  const blobs = useBlobSource();
  const [busy, setBusy] = useState(false);

  const run = (format: ExportFormat) => {
    setBusy(true);
    exportProject(data, project, format, blobs)
      .then((fileName) => toast({ message: `Downloaded ${fileName}` }))
      .catch(() => toast({ tone: "error", message: "The export didn't work. Try again." }))
      .finally(() => setBusy(false));
  };

  return (
    <Menu
      label="Export comments"
      icon="download"
      text={busy ? "Exporting…" : "Export"}
      testId="export-menu"
      disabledReason={commentCount === 0 ? NO_COMMENTS : busy ? BUSY : null}
      triggerClassName={`${buttonClass("secondary", "sm")} max-sm:size-11 max-sm:px-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
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
  );
}
