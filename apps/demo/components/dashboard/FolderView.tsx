"use client";

import { useMemo, useState } from "react";
import { holdBlobs } from "@/lib/store/blob-sweep";
import { referencedBlobKeys } from "@/lib/store/snapshots";
import {
  deleteProject,
  finalizeProjectDelete,
  moveProject,
  renameProject,
  restoreProject,
} from "@/lib/store/actions";
import { ancestorsOf, childFolders } from "@/lib/store/folders";
import { folderSummaries } from "@/lib/store/selectors";
import type { Folder, Project } from "@/lib/store/types";
import { useDialogState } from "@/lib/use-dialog-state";
import { useNow } from "@/lib/use-now";
import { FolderGrid } from "../overview/FolderGrid";
import { useToast } from "../ui/ToastProvider";
import { Breadcrumb } from "./Breadcrumb";
import { DashboardEmpty } from "./DashboardEmpty";
import { DashboardHeader } from "./DashboardHeader";
import { FolderNotFound } from "./FolderNotFound";
import { FolderSkeleton } from "./FolderSkeleton";
import { ProjectDialogs } from "./ProjectDialogs";
import { ProjectGrid } from "./ProjectGrid";
import { sortProjects } from "./project-sort";
import type { StatusFilterValue } from "./status-filter";
import { useProjectSort } from "./use-project-sort";
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

/**
 * Breadcrumb and folder header with summary chips, then its subfolders as
 * folder cards, then the status filter's projects in the chosen order, and the project dialogs.
 */
function FolderContent({ workspace, folder }: { workspace: Workspace; folder: Folder }) {
  const { data, persistent, folders, report } = workspace;
  const toast = useToast();
  const now = useNow();
  const [filter, setFilter] = useState<StatusFilterValue>("all");
  const { sort, setKey, reverse } = useProjectSort();

  const summaries = useMemo(() => folderSummaries(data, folder.id), [data, folder.id]);
  const subfolders = useMemo(() => childFolders(folders, folder.id), [folders, folder.id]);
  const ancestors = useMemo(() => ancestorsOf(folders, folder.id), [folders, folder.id]);
  const visible = useMemo(
    () =>
      sortProjects(
        filter === "all" ? summaries : summaries.filter((entry) => entry.status === filter),
        sort.key,
        sort.direction,
      ),
    [summaries, filter, sort],
  );

  const projectRename = useDialogState<Project>();
  const projectMove = useDialogState<Project>();
  const projectDelete = useDialogState<Project>();

  const withComments = summaries.filter((entry) => entry.status === "comments").length;
  const chips = [
    plural(summaries.length, "project"),
    ...(subfolders.length ? [plural(subfolders.length, "subfolder")] : []),
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
        sort={sort}
        onSortKey={setKey}
        onReverseSort={reverse}
        actions={workspace.folderActions(folder)}
        breadcrumb={<Breadcrumb ancestors={ancestors} current={folder} />}
      />
      {subfolders.length ? (
        <section aria-labelledby="subfolders-heading" className="flex flex-col gap-2">
          <h2 id="subfolders-heading" className="text-heading font-bold">
            Subfolders
          </h2>
          {/*
           * On touch, folder cards pull their headroom up (FolderCard); on the Overview the
           * hero's padding takes it, here this padding does, so the first row clears the heading.
           */}
          <div className="[@media(hover:none)]:pt-8">
            <FolderGrid
              workspace={workspace}
              folders={subfolders}
              labelledBy="subfolders-heading"
            />
          </div>
        </section>
      ) : null}
      {subfolders.length ? <h2 className="text-heading font-bold">Projects</h2> : null}
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
          // Its images stay while Undo is offered, however long the toast is held open.
          const release = holdBlobs(
            referencedBlobKeys({ ...data, projects: [project], comments, snapshots }),
          );
          const result = deleteProject(project.id);
          if (!result.ok) {
            release();
            report(result);
            return;
          }
          toast({
            message: `Deleted ${project.name}`,
            action: {
              label: "Undo",
              onAction: () => {
                report(restoreProject(project, comments, snapshots), `Restored ${project.name}`);
                release();
              },
            },
            // Undo is gone, so the delete is final: a shared link is revoked now.
            onDismiss: () => {
              release();
              finalizeProjectDelete(project.id);
            },
          });
        }}
      />
    </>
  );
}
