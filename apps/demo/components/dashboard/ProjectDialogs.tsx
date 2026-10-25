"use client";

import type { DialogState } from "@/lib/use-dialog-state";
import type { Folder, Project } from "@/lib/store/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";
import { MoveProjectDialog } from "./MoveProjectDialog";

interface ProjectDialogsProps {
  folders: readonly Folder[];
  rename: DialogState<Project>;
  move: DialogState<Project>;
  remove: DialogState<Project>;
  onRename: (project: Project, name: string) => string | null;
  onMove: (project: Project, folderId: string) => void;
  onDelete: (project: Project) => void;
}

/** Rename, move and delete dialogs for projects. */
export function ProjectDialogs({
  folders,
  rename,
  move,
  remove,
  onRename,
  onMove,
  onDelete,
}: ProjectDialogsProps) {
  return (
    <>
      <PromptDialog
        open={rename.open}
        onClose={rename.close}
        title="Rename project"
        label="Project name"
        initialValue={rename.payload?.name}
        submitLabel="Save"
        onSubmit={(name) => (rename.payload ? onRename(rename.payload, name) : null)}
      />
      <MoveProjectDialog
        open={move.open}
        project={move.payload}
        folders={folders}
        onClose={move.close}
        onMove={(folderId) => move.payload && onMove(move.payload, folderId)}
      />
      <ConfirmDialog
        open={remove.open}
        onClose={remove.close}
        title={remove.payload ? `Delete ${remove.payload.name}?` : "Delete project?"}
        description={
          remove.payload?.share
            ? "The project and all its comments will be deleted, and its share link will stop working. You'll have a few seconds to undo it."
            : "The project and all its comments will be deleted. You'll have a few seconds to undo it."
        }
        confirmLabel="Delete project"
        onConfirm={() => remove.payload && onDelete(remove.payload)}
      />
    </>
  );
}
