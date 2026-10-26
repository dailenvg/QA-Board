"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { OVERVIEW_HREF, folderHref, projectHref } from "@/lib/routes";
import { createFolder, deleteFolder, moveFolder, renameFolder } from "@/lib/store/actions";
import {
  canDeleteFolder,
  folderContents,
  folderMoveProblem,
  projectsInside,
  subtreeIds,
  type FolderContents,
} from "@/lib/store/folders";
import { pickFolder, sortedFolders } from "@/lib/store/selectors";
import type { Folder, Project, SquintData } from "@/lib/store/types";
import { useSquint } from "@/lib/store/use-squint";
import { useDialogState } from "@/lib/use-dialog-state";
import { useMediaQuery } from "@/lib/use-media-query";
import { useShortcut } from "@/lib/use-shortcut";
import { DataRecovery } from "../app-state/DataRecovery";
import { NewProjectDialog } from "../new-project/NewProjectDialog";
import { SearchQueryProvider } from "../search/SearchQueryProvider";
import { WorkspaceSearch } from "../search/WorkspaceSearch";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { FolderDialogs } from "./FolderDialogs";
import { MoveFolderDialog } from "./MoveFolderDialog";
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
 * search, New project and the folder dialogs live here so every page shares them.
 * Pages read the data through `useWorkspace()`, which is null while loading.
 */
export function Workspace({ children }: { children: ReactNode }) {
  const state = useSquint();
  if (state.status === "corrupt") return <DataRecovery reason={state.reason} raw={state.raw} />;
  return (
    <>
      <Revocations />
      <SearchQueryProvider>
        <WorkspaceShell store={state.status === "ready" ? state : null}>{children}</WorkspaceShell>
      </SearchQueryProvider>
    </>
  );
}

function WorkspaceShell({ store, children }: { store: ReadyStore | null; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { id: routeFolderId } = useParams<{ id?: string }>();
  const toast = useToast();
  const onOverview = pathname === OVERVIEW_HREF;
  /** Tailwind's `lg`, in rem like the CSS: sidebar beside the page rather than above it. */
  const wide = useMediaQuery("(min-width: 64rem)");
  const data = store?.data ?? null;
  const persistent = store?.persistent ?? true;

  // The folder page being left after deleting its folder. The store updates at once but the
  // navigation doesn't, so this keeps that page from flashing "not found" meanwhile.
  const [leaving, setLeaving] = useState<{ folderId: string; from: string } | null>(null);
  if (leaving && leaving.from !== pathname) setLeaving(null);
  const leavingFolderId = leaving?.folderId ?? null;

  const folders = useMemo(() => (data ? sortedFolders(data) : []), [data]);
  const counts = useMemo(
    () =>
      new Map(
        data ? folders.map((folder) => [folder.id, projectsInside(data, folder.id).length]) : [],
      ),
    [data, folders],
  );

  const newProject = useDialogState<{ folderId?: string }>();
  const newFolder = useDialogState<{ parentId: string | null }>();
  const folderRename = useDialogState<Folder>();
  const folderMove = useDialogState<Folder>();
  const folderDelete = useDialogState<{ folder: Folder; contents: FolderContents }>();
  const { show: showNewProject } = newProject;
  const { show: showNewFolder } = newFolder;
  const { show: showRename } = folderRename;
  const { show: showMove } = folderMove;
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

  const workspace = useMemo<WorkspaceValue | null>(() => {
    if (!data) return null;
    const deleteFolder = (folder: Folder) =>
      showDelete({ folder, contents: folderContents(data, folder.id) });
    const deletable = (folder: Folder) => canDeleteFolder(folders, folder.id);
    // Somewhere to go: the top level, or any folder outside this one.
    const movable = (folder: Folder) =>
      [null, ...folders.map((entry) => entry.id)].some(
        (parentId) => !folderMoveProblem(folders, folder.id, parentId),
      );
    return {
      data,
      persistent,
      folders,
      openNewProject: (folderId) => showNewProject({ folderId }),
      newFolder: (parentId) => showNewFolder({ parentId }),
      renameFolder: showRename,
      moveFolder: showMove,
      deleteFolder,
      canDeleteFolder: deletable,
      folderActions: (folder) => [
        {
          label: "New folder inside",
          icon: "folderPlus",
          onSelect: () => showNewFolder({ parentId: folder.id }),
        },
        { label: "Rename folder", icon: "pencil", onSelect: () => showRename(folder) },
        {
          label: movable(folder) ? "Move folder" : "Nowhere to move it yet",
          icon: "folder",
          onSelect: () => showMove(folder),
          disabled: !movable(folder),
        },
        {
          label: deletable(folder)
            ? "Delete folder"
            : folders.length === 1
              ? "Can't delete your only folder"
              : "Can't delete: every other folder is inside it",
          icon: "trash",
          onSelect: () => deleteFolder(folder),
          danger: true,
          disabled: !deletable(folder),
        },
      ],
      report,
      leavingFolderId,
    };
  }, [
    data,
    persistent,
    folders,
    showNewProject,
    showNewFolder,
    showRename,
    showMove,
    showDelete,
    report,
    leavingFolderId,
  ]);

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

  /**
   * One search, mounted in one place: top right of the page on wide screens; in the sidebar's
   * header when the sidebar stacks above the page (else it would sit below the whole sidebar).
   * Crossing `lg` remounts it; the query lives in `SearchQueryProvider`, so it carries over.
   */
  const search = workspace ? <WorkspaceSearch data={workspace.data} /> : null;

  return (
    <WorkspaceContext.Provider value={workspace}>
      {/* overflow-x-clip: an open folder's fan may reach into the gutters, never past the screen. */}
      <div className="flex min-h-dvh flex-col gap-4 overflow-x-clip p-4 lg:flex-row lg:items-start">
        {workspace ? (
          <Sidebar
            folders={folders}
            counts={counts}
            actionsFor={workspace.folderActions}
            activeId={routeFolderId ?? null}
            overviewActive={onOverview}
            persistent={persistent}
            onNewProject={() => showNewProject({})}
            onNewFolder={() => showNewFolder({ parentId: null })}
            search={wide ? null : search}
          />
        ) : (
          <SidebarSkeleton />
        )}
        <main id="main" className="flex min-w-0 flex-1 flex-col gap-4 self-stretch">
          {/*
            Wide screens only (CSS, so the row never pops in after hydration); the skeleton holds
            its place until the store and the media query are both known. z-30: the open search
            results lie over the page below.
          */}
          <div className="relative z-30 flex justify-end max-lg:hidden">
            {wide && search ? search : <Skeleton className="h-11 w-80" />}
          </div>
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
          <MoveFolderDialog
            open={folderMove.open}
            folder={folderMove.payload}
            folders={folders}
            onClose={folderMove.close}
            onMove={(parentId) => {
              const target = folderMove.payload;
              folderMove.close();
              if (!target) return;
              const parent = folders.find((entry) => entry.id === parentId);
              report(
                moveFolder(target.id, parentId),
                `Moved ${target.name} ${parent ? `into ${parent.name}` : "to the top level"}`,
              );
            }}
          />
          <FolderDialogs
            create={newFolder}
            rename={folderRename}
            remove={folderDelete}
            parentOf={(parentId) => folders.find((folder) => folder.id === parentId) ?? null}
            onCreate={(name, parentId) => {
              const result = createFolder(name, parentId);
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
              // The folder's page, or a subfolder's, is open: leave it once the folder is gone.
              const viewing =
                routeFolderId !== undefined && subtreeIds(folders, target.id).has(routeFolderId);
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
