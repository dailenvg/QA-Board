"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { OVERVIEW_HREF, folderHref, projectHref } from "@/lib/routes";
import { createFolder, deleteFolder, renameFolder } from "@/lib/store/actions";
import { pickFolder, projectCount, sortedFolders } from "@/lib/store/selectors";
import type { Folder, Project, SquintData } from "@/lib/store/types";
import { useSquint } from "@/lib/store/use-squint";
import { useDialogState } from "@/lib/use-dialog-state";
import { useShortcut } from "@/lib/use-shortcut";
import { DataRecovery } from "../app-state/DataRecovery";
import { NewProjectDialog } from "../new-project/NewProjectDialog";
import { useToast } from "../ui/ToastProvider";
import { FolderDialogs } from "./FolderDialogs";
import { Sidebar } from "./Sidebar";
import { SidebarSkeleton } from "./SidebarSkeleton";
import { WorkspaceContext, type Workspace as WorkspaceValue } from "./workspace-context";
import { Revocations } from "../app-state/Revocations";

interface ReadyStore {
  data: SquintData;
  persistent: boolean;
}

/**
 * Persistent shell for the Overview and folder pages: the sidebar stays
 * mounted across them (so its active indicator glides between items), and
 * New project plus the folder dialogs live here so every page shares them.
 * Pages read the data through `useWorkspace()`, which is null while loading.
 */
export function Workspace({ children }: { children: ReactNode }) {
  const state = useSquint();
  if (state.status === "corrupt") return <DataRecovery reason={state.reason} raw={state.raw} />;
  return (
    <>
      <Revocations />
      <WorkspaceShell store={state.status === "ready" ? state : null}>{children}</WorkspaceShell>
    </>
  );
}

function WorkspaceShell({ store, children }: { store: ReadyStore | null; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { id: routeFolderId } = useParams<{ id?: string }>();
  const toast = useToast();
  const onOverview = pathname === OVERVIEW_HREF;
  const data = store?.data ?? null;
  const persistent = store?.persistent ?? true;

  // The folder page being left after deleting its folder. The store updates at once but the
  // navigation doesn't, so this keeps that page from flashing "not found" meanwhile.
  const [leaving, setLeaving] = useState<{ folderId: string; from: string } | null>(null);
  if (leaving && leaving.from !== pathname) setLeaving(null);
  const leavingFolderId = leaving?.folderId ?? null;

  const folders = useMemo(() => (data ? sortedFolders(data) : []), [data]);
  const entries = useMemo(
    () => (data ? folders.map((folder) => ({ folder, count: projectCount(data, folder.id) })) : []),
    [data, folders],
  );

  const newProject = useDialogState<{ folderId?: string }>();
  const newFolder = useDialogState<true>();
  const folderRename = useDialogState<Folder>();
  const folderDelete = useDialogState<{ folder: Folder; projects: number; shared: number }>();
  const { show: showNewProject } = newProject;
  const { show: showRename } = folderRename;
  const { show: showDelete } = folderDelete;

  useShortcut("n", () => showNewProject({}), store !== null);

  const report = useCallback(
    (result: { ok: boolean; error?: string }, success?: string) => {
      if (!result.ok)
        toast({ tone: "error", message: result.error ?? "Something went wrong. Try again." });
      else if (success) toast({ message: success });
      return result.ok;
    },
    [toast],
  );

  const workspace = useMemo<WorkspaceValue | null>(
    () =>
      data
        ? {
            data,
            persistent,
            folders,
            openNewProject: (folderId) => showNewProject({ folderId }),
            renameFolder: showRename,
            deleteFolder: (folder) =>
              showDelete({
                folder,
                projects: projectCount(data, folder.id),
                shared: data.projects.filter((p) => p.folderId === folder.id && p.share).length,
              }),
            report,
            leavingFolderId,
          }
        : null,
    [data, persistent, folders, showNewProject, showRename, showDelete, report, leavingFolderId],
  );

  /**
   * One project opens, unless it was made on the Overview: the new sheet drops into its
   * folder there, so stay and offer a way in. Several stay put and offer their folder.
   */
  const onCreated = (projects: Project[]) => {
    newProject.close();
    const [project] = projects;
    if (!project) return;
    const folder = folders.find((entry) => entry.id === project.folderId);
    if (projects.length > 1) {
      const added = `Added ${projects.length} projects`;
      toast({
        message: folder ? `${added} to ${folder.name}` : added,
        action: { label: "Open folder", onAction: () => router.push(folderHref(project.folderId)) },
      });
      return;
    }
    if (!onOverview) {
      router.push(projectHref(project.id));
      return;
    }
    toast({
      message: folder ? `Added ${project.name} to ${folder.name}` : `Added ${project.name}`,
      action: { label: "Open", onAction: () => router.push(projectHref(project.id)) },
    });
  };

  return (
    <WorkspaceContext.Provider value={workspace}>
      {/* overflow-x-clip: an open folder's fan may reach into the gutters, never past the screen. */}
      <div className="flex min-h-dvh flex-col gap-4 overflow-x-clip p-4 lg:flex-row lg:items-start">
        {workspace ? (
          <Sidebar
            entries={entries}
            activeId={routeFolderId ?? null}
            overviewActive={onOverview}
            persistent={persistent}
            onNewProject={() => showNewProject({})}
            onNewFolder={() => newFolder.show(true)}
          />
        ) : (
          <SidebarSkeleton />
        )}
        <main id="main" className="flex min-w-0 flex-1 flex-col gap-4 self-stretch">
          {children}
        </main>
      </div>

      {workspace ? (
        <>
          <NewProjectDialog
            open={newProject.open}
            onClose={newProject.close}
            folders={folders}
            defaultFolderId={
              pickFolder(folders, newProject.payload?.folderId ?? routeFolderId ?? null).id
            }
            onCreated={onCreated}
          />
          <FolderDialogs
            create={newFolder}
            rename={folderRename}
            remove={folderDelete}
            onCreate={(name) => {
              const result = createFolder(name);
              if (!result.ok) return result.error;
              newFolder.close();
              router.push(folderHref(result.value.id), { scroll: false });
              return null;
            }}
            onRename={(target, name) => {
              const result = renameFolder(target.id, name);
              if (!result.ok) return result.error;
              folderRename.close();
              return null;
            }}
            onDelete={(target) => {
              folderDelete.close();
              const viewing = target.id === routeFolderId;
              if (viewing) setLeaving({ folderId: target.id, from: pathname });
              if (!report(deleteFolder(target.id), `Deleted ${target.name}`)) {
                setLeaving(null);
              } else if (viewing) {
                router.replace(OVERVIEW_HREF, { scroll: false });
              }
            }}
          />
        </>
      ) : null}
    </WorkspaceContext.Provider>
  );
}
