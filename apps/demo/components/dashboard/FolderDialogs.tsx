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

function deleteDescription({ projects, shared }: FolderContents): string {
  if (projects === 0) return "This folder is empty.";
  const noun = projects === 1 ? "project" : "projects";
  const links =
    shared === 0
      ? ""
      : shared === 1
        ? " One share link will stop working."
        : ` ${shared} share links will stop working.`;
  return `Its ${projects} ${noun} and all of their comments will be deleted too.${links} This can't be undone.`;
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
        description={removing ? deleteDescription(removing.contents) : ""}
        confirmLabel="Delete folder"
        onConfirm={() => removing && onDelete(removing.folder)}
      />
    </>
  );
}
