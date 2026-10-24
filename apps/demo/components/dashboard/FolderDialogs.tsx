"use client";

import type { DialogState } from "@/lib/use-dialog-state";
import type { Folder } from "@/lib/store/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";

interface FolderDialogsProps {
  create: DialogState<true>;
  rename: DialogState<Folder>;
  remove: DialogState<{ folder: Folder; projects: number; shared: number }>;
  onCreate: (name: string) => string | null;
  onRename: (folder: Folder, name: string) => string | null;
  onDelete: (folder: Folder) => void;
}

function deleteDescription(projects: number, shared: number): string {
  if (projects === 0) return "This folder is empty.";
  const noun = projects === 1 ? "project" : "projects";
  const links =
    shared === 0
      ? ""
      : shared === 1
        ? " Its client link will stop working."
        : ` Their ${shared} client links will stop working.`;
  return `Its ${projects} ${noun} and all of their comments will be deleted too.${links} This can't be undone.`;
}

/** Create, rename and delete dialogs for folders. */
export function FolderDialogs({
  create,
  rename,
  remove,
  onCreate,
  onRename,
  onDelete,
}: FolderDialogsProps) {
  const renaming = rename.payload;
  const removing = remove.payload;
  return (
    <>
      <PromptDialog
        open={create.open}
        onClose={create.close}
        title="New folder"
        label="Folder name"
        submitLabel="Create folder"
        onSubmit={onCreate}
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
        description={removing ? deleteDescription(removing.projects, removing.shared) : ""}
        confirmLabel="Delete folder"
        onConfirm={() => removing && onDelete(removing.folder)}
      />
    </>
  );
}
