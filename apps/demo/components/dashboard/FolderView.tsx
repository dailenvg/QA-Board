"use client";

import { useMemo } from "react";
import {
  deleteProject,
  moveProject,
  renameProject,
  restoreProject,
  setProjectArchived,
  setProjectLabel,
} from "@/lib/store/actions";
import { isArchived, labelsOf, workspaceLabels } from "@/lib/store/archive";
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
import { isFiltered, matchesFilter, noMatchKind } from "./status-filter";
import { focusStatusFilter } from "./StatusFilter";
import { useProjectFilter } from "./use-project-filter";
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
 * Breadcrumb and folder header with summary chips, then its subfolders as folder cards, then
 * the projects the status and label filters show (archived ones only under Archived) in the
 * chosen order, and the project dialogs.
 */
function FolderContent({ workspace, folder }: { workspace: Workspace; folder: Folder }) {
  const { allData, folders, report } = workspace;
  const toast = useToast();
  const now = useNow();
  const { sort, setKey, reverse } = useProjectSort();

  // Archived projects included: the Archived filter shows them.
  const summaries = useMemo(() => folderSummaries(allData, folder.id), [allData, folder.id]);
  const labels = useMemo(() => labelsOf(summaries.map((entry) => entry.project)), [summaries]);
  const allLabels = useMemo(() => workspaceLabels(allData), [allData]);
  const { filter, setStatus, setLabel, reset } = useProjectFilter(labels);
  const active = useMemo(
    () => summaries.filter((entry) => !isArchived(entry.project)),
    [summaries],
  );
  const subfolders = useMemo(() => childFolders(folders, folder.id), [folders, folder.id]);
  const ancestors = useMemo(() => ancestorsOf(folders, folder.id), [folders, folder.id]);
  const visible = useMemo(
    () =>
      sortProjects(
        summaries.filter((entry) => matchesFilter(entry.project, entry.status, filter)),
        sort.key,
        sort.direction,
      ),
    [summaries, filter, sort],
  );

  const projectRename = useDialogState<Project>();
  const projectMove = useDialogState<Project>();
  const projectLabel = useDialogState<Project>();
  const projectDelete = useDialogState<Project>();

  const withComments = active.filter((entry) => entry.status === "comments").length;
  const chips = [
    plural(active.length, "project"),
    ...(subfolders.length ? [plural(subfolders.length, "subfolder")] : []),
    ...(withComments > 0 ? [`${withComments} with active comments`] : []),
  ];
  // Nothing to review here (archived projects aside): the folder's own empty state.
  const empty = active.length === 0 && !isFiltered(filter);

  const archive = (project: Project) => {
    const archiving = !isArchived(project);
    if (!report(setProjectArchived(project.id, archiving))) return;
    toast({
      message: archiving ? `Archived ${project.name}` : `Unarchived ${project.name}`,
      action: {
        label: "Undo",
        onAction: () => void report(setProjectArchived(project.id, !archiving)),
      },
    });
  };

  return (
    <>
      <DashboardHeader
        folder={folder}
        chips={chips}
        filter={filter}
        labels={labels}
        onStatus={setStatus}
        onLabel={setLabel}
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
        {isFiltered(filter) ? `${plural(visible.length, "project")} shown` : ""}
      </p>
      {empty ? (
        <DashboardEmpty kind="folder" onAction={() => workspace.openNewProject(folder.id)} />
      ) : visible.length === 0 ? (
        <DashboardEmpty
          kind={noMatchKind(filter, "folder")}
          onAction={() => {
            reset();
            focusStatusFilter();
          }}
        />
      ) : (
        <ProjectGrid
          summaries={visible}
          canMove={folders.length > 1}
          now={now}
          onRename={projectRename.show}
          onMove={projectMove.show}
          onLabel={projectLabel.show}
          onArchive={archive}
          onDelete={projectDelete.show}
        />
      )}

      <ProjectDialogs
        folders={folders}
        labels={allLabels}
        rename={projectRename}
        move={projectMove}
        label={projectLabel}
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
        onLabel={(project, label) => {
          projectLabel.close();
          report(
            setProjectLabel(project.id, label),
            label === null ? `Removed the label from ${project.name}` : undefined,
          );
        }}
        onDelete={(project) => {
          projectDelete.close();
          const comments = allData.comments.filter((comment) => comment.projectId === project.id);
          const snapshots = allData.snapshots.filter(
            (snapshot) => snapshot.projectId === project.id,
          );
          // The project goes to the workspace's trash, so Undo brings it back whole.
          if (!report(deleteProject(project.id))) return;
          toast({
            message: `Deleted ${project.name}`,
            action: {
              label: "Undo",
              onAction: () =>
                void report(
                  restoreProject(project, comments, snapshots),
                  `Restored ${project.name}`,
                ),
            },
          });
        }}
      />
    </>
  );
}
