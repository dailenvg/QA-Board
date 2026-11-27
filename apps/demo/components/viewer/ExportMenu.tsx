"use client";

import { useState, type Ref } from "react";
import { useBlobSource, type BlobSource } from "@/lib/blob-store/blob-source";
import { exportProject, type ExportFormat } from "@/lib/export/export-project";
import type { ExportAudience } from "@/lib/export/types";
import type { Project, SquintData } from "@/lib/store/types";
import { buttonClass } from "../ui/button-styles";
import { Menu, type MenuHandle } from "../ui/Menu";
import type { MenuItem } from "../ui/menu-item";
import { useToast, type ToastInput } from "../ui/ToastProvider";

interface ExportMenuProps {
  data: SquintData;
  project: Project;
  commentCount: number;
  /**
   * The team's viewer: the menu has a "For your team" group and, while any comment is one
   * clients see, a "For your client" one (U8). A guest's menu stays as it is.
   */
  team?: boolean;
  /** Opens this menu from elsewhere, such as the deletion notice's Export button. */
  handle?: Ref<MenuHandle>;
}

const NO_COMMENTS = "Add a comment first. There's nothing to export yet.";
const BUSY = "Preparing your export…";

interface ExportRun {
  data: SquintData;
  project: Project;
  format: ExportFormat;
  audience: ExportAudience;
  blobs: BlobSource;
  toast: (toast: ToastInput) => void;
  setBusy: (busy: boolean) => void;
}

/**
 * One export, reported by toast. A module-level function, so the failure
 * toast's Retry can call it again without a component closure referring to itself.
 */
function runExport(job: ExportRun): void {
  const { data, project, format, audience, blobs, toast, setBusy } = job;
  setBusy(true);
  exportProject(data, project, format, blobs, audience)
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

const TEAM_GROUP = "For your team";
const CLIENT_GROUP = "For your client";

/**
 * The menu's items: a ZIP with screenshots, or bare Markdown or JSON, as one list for a guest;
 * in the team's viewer, those "For your team", then a ZIP and Markdown "For your client"
 * (D14), left out while every comment is team only.
 */
function exportItems(
  run: (format: ExportFormat, audience: ExportAudience) => void,
  team: boolean,
  forClient: boolean,
): MenuItem[] {
  const group = team ? TEAM_GROUP : undefined;
  const teamItems: MenuItem[] = [
    {
      label: "ZIP (Markdown + JSON + screenshots)",
      icon: "fileArchive",
      group,
      onSelect: () => run("zip", "team"),
    },
    { label: "Markdown", icon: "fileText", group, onSelect: () => run("markdown", "team") },
    { label: "JSON", icon: "fileJson", group, onSelect: () => run("json", "team") },
  ];
  if (!team || !forClient) return teamItems;
  return [
    ...teamItems,
    {
      id: "client-zip",
      label: "ZIP (Markdown + JSON + screenshots)",
      icon: "fileArchive",
      group: CLIENT_GROUP,
      testId: "export-client-zip",
      onSelect: () => run("zip", "client"),
    },
    {
      id: "client-markdown",
      label: "Markdown",
      icon: "fileText",
      group: CLIENT_GROUP,
      testId: "export-client-markdown",
      onSelect: () => run("markdown", "client"),
    },
  ];
}

/** Top-bar Export menu: a ZIP with screenshots, or bare Markdown or JSON; the team's has a client's too. */
export function ExportMenu({ data, project, commentCount, team = false, handle }: ExportMenuProps) {
  const toast = useToast();
  const blobs = useBlobSource();
  const [busy, setBusy] = useState(false);
  const forClient = data.comments.some(
    (comment) => comment.projectId === project.id && !comment.teamOnly,
  );

  const run = (format: ExportFormat, audience: ExportAudience) =>
    runExport({ data, project, format, audience, blobs, toast, setBusy });

  return (
    <>
      <Menu
        // While busy the name says so too, not only the status message.
        label={busy ? "Exporting comments…" : "Export comments"}
        icon="download"
        text={busy ? "Exporting…" : "Export"}
        testId="export-menu"
        handle={handle}
        disabledReason={commentCount === 0 ? NO_COMMENTS : busy ? BUSY : null}
        // Phones: the popup anchors to the top bar's right edge, not the trigger, so it can't
        // run off the left side of a 375px screen.
        className="max-sm:static"
        triggerClassName={`${buttonClass("secondary", "sm")} max-sm:size-11 max-sm:px-0`}
        items={exportItems(run, team, forClient)}
      />
      {/* The trigger's name also changes while busy; this status tells screen readers work started. */}
      <span role="status" className="sr-only">
        {busy ? BUSY : ""}
      </span>
    </>
  );
}
