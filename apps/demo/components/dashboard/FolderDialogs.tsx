"use client";

import type { DialogState } from "@/lib/use-dialog-state";
import type { FolderContents } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";

interface FolderDialogsProps {
  create: DialogState<{ parentId: string | null }>;
  rename: DialogState<Folder>;
  remove: DialogState<{ folder: Folder; contents: FolderContents }>;
  /** The folder a new one goes inside. */
  parentOf: (parentId: string | null) => Folder | null;
  onCreate: (name: string, parentId: string | null) => string | null;
  onRename: (folder: Folder, name: string) => string | null;
  onDelete: (folder: Folder) => void;
}

const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;

/** What goes with the folder, counted, and that it can't be undone. */
function DeleteSummary({ subfolders, projects, comments, shared }: FolderContents) {
  if (subfolders + projects === 0) return <p>This folder is empty.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p>Everything inside it is deleted too:</p>
      <ul data-testid="folder-delete-counts" className="list-disc pl-5 text-ink-2">
        {subfolders ? <li>{count(subfolders, "subfolder")}</li> : null}
        <li>{count(projects, "project")}</li>
        <li>{count(comments, "comment")}</li>
        {shared ? (
          <li className="font-semibold text-danger">
            {shared === 1 ? "1 share link stops" : `${shared} share links stop`} working
          </li>
        ) : null}
      </ul>
      <p className="font-semibold text-ink">This can&apos;t be undone.</p>
    </div>
  );
}

/** Create, rename and delete dialogs for folders. */
export function FolderDialogs({
  create,
  rename,
  remove,
  parentOf,
  onCreate,
  onRename,
  onDelete,
}: FolderDialogsProps) {
  const renaming = rename.payload;
  const removing = remove.payload;
  const parentId = create.payload?.parentId ?? null;
  const parent = parentOf(parentId);
  return (
    <>
      <PromptDialog
        open={create.open}
        onClose={create.close}
        title={parent ? `New folder in ${parent.name}` : "New folder"}
        label="Folder name"
        submitLabel="Create folder"
        onSubmit={(name) => onCreate(name, parentId)}
        testId="new-folder-dialog"
      />
      <PromptDialog
        open={rename.open}
        onClose={rename.close}
        title="Rename folder"
        label="Folder name"
        initialValue={renaming?.name}
        submitLabel="Save"
        onSubmit={(name) => (renaming ? onRename(renaming, name) : null)}
      />
      <ConfirmDialog
        open={remove.open}
        onClose={remove.close}
        title={removing ? `Delete ${removing.folder.name}?` : "Delete folder?"}
        description={removing ? <DeleteSummary {...removing.contents} /> : ""}
        confirmLabel="Delete folder"
        onConfirm={() => removing && onDelete(removing.folder)}
      />
    </>
  );
}
