"use client";

import { useMemo, useState } from "react";
import { deleteProject, moveProject, renameProject, restoreProject } from "@/lib/store/actions";
import { folderSummaries } from "@/lib/store/selectors";
import type { Folder, Project } from "@/lib/store/types";
import { useDialogState } from "@/lib/use-dialog-state";
import { useNow } from "@/lib/use-now";
import { useToast } from "../ui/ToastProvider";
import { DashboardEmpty } from "./DashboardEmpty";
import { DashboardHeader } from "./DashboardHeader";
import { FolderNotFound } from "./FolderNotFound";
import { FolderSkeleton } from "./FolderSkeleton";
import { ProjectDialogs } from "./ProjectDialogs";
import { ProjectGrid } from "./ProjectGrid";
import type { StatusFilterValue } from "./status-filter";
import { useWorkspace, type Workspace } from "./workspace-context";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** `/f/[id]`: skeleton while loading, a way back for unknown ids, else the folder. */
export function FolderView({ folderId }: { folderId: string }) {
  const workspace = useWorkspace();
  if (!workspace) return <FolderSkeleton />;
  const folder = workspace.folders.find((entry) => entry.id === folderId);
  if (folder) return <FolderContent key={folder.id} workspace={workspace} folder={folder} />;
  return workspace.leavingFolderId === folderId ? null : <FolderNotFound />;
}

/** Folder header with summary chips, the status filter, the project grid and project dialogs. */
function FolderContent({ workspace, folder }: { workspace: Workspace; folder: Folder }) {
  const { data, persistent, folders, report } = workspace;
  const toast = useToast();
  const now = useNow();
  const [filter, setFilter] = useState<StatusFilterValue>("all");

  const summaries = useMemo(() => folderSummaries(data, folder.id), [data, folder.id]);
  const visible =
    filter === "all" ? summaries : summaries.filter((entry) => entry.status === filter);

  const projectRename = useDialogState<Project>();
  const projectMove = useDialogState<Project>();
  const projectDelete = useDialogState<Project>();

  const withComments = summaries.filter((entry) => entry.status === "comments").length;
  const chips = [
    plural(summaries.length, "project"),
    ...(withComments > 0 ? [`${withComments} with active comments`] : []),
    ...(persistent ? [] : ["Not saved: storage is blocked"]),
  ];

  return (
    <>
      <DashboardHeader
        folder={folder}
        chips={chips}
        filter={filter}
        onFilter={setFilter}
        canDeleteFolder={folders.length > 1}
        onRenameFolder={() => workspace.renameFolder(folder)}
        onDeleteFolder={() => workspace.deleteFolder(folder)}
      />
      <p className="sr-only" aria-live="polite">
        {filter === "all" ? "" : `${plural(visible.length, "project")} shown`}
      </p>
      {summaries.length === 0 ? (
        <DashboardEmpty kind="folder" onAction={() => workspace.openNewProject(folder.id)} />
      ) : visible.length === 0 ? (
        <DashboardEmpty kind="filter" onAction={() => setFilter("all")} />
      ) : (
        <ProjectGrid
          summaries={visible}
          canMove={folders.length > 1}
          now={now}
          onRename={projectRename.show}
          onMove={projectMove.show}
          onDelete={projectDelete.show}
        />
      )}

      <ProjectDialogs
        folders={folders}
        rename={projectRename}
        move={projectMove}
        remove={projectDelete}
        onRename={(project, name) => {
          const result = renameProject(project.id, name);
          if (!result.ok) return result.error;
          projectRename.close();
          return null;
        }}
        onMove={(project, folderId) => {
          projectMove.close();
          const target = folders.find((entry) => entry.id === folderId);
          report(moveProject(project.id, folderId), `Moved to ${target?.name ?? "folder"}`);
        }}
        onDelete={(project) => {
          projectDelete.close();
          const comments = data.comments.filter((comment) => comment.projectId === project.id);
          const snapshots = data.snapshots.filter((snapshot) => snapshot.projectId === project.id);
          const result = deleteProject(project.id);
          if (!result.ok) {
            report(result);
            return;
          }
          toast({
            message: `Deleted ${project.name}`,
            action: {
              label: "Undo",
              onAction: () =>
                report(restoreProject(project, comments, snapshots), `Restored ${project.name}`),
            },
          });
        }}
      />
    </>
  );
}
