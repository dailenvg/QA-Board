"use client";

import type { DialogState } from "@/lib/use-dialog-state";
import type { Folder, Project } from "@/lib/store/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";
import { LabelDialog } from "./LabelDialog";
import { MoveProjectDialog } from "./MoveProjectDialog";

interface ProjectDialogsProps {
  folders: readonly Folder[];
  /** Labels in use in the workspace, suggested in the label dialog. */
  labels: readonly string[];
  rename: DialogState<Project>;
  move: DialogState<Project>;
  label: DialogState<Project>;
  remove: DialogState<Project>;
  onRename: (project: Project, name: string) => string | null;
  onMove: (project: Project, folderId: string) => void;
  onLabel: (project: Project, label: string | null) => void;
  onDelete: (project: Project) => void;
}

/** Rename, move, label and delete dialogs for projects. */
export function ProjectDialogs({
  folders,
  labels,
  rename,
  move,
  label,
  remove,
  onRename,
  onMove,
  onLabel,
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
      <LabelDialog
        open={label.open}
        project={label.payload}
        labels={labels}
        onClose={label.close}
        onSave={(value) => label.payload && onLabel(label.payload, value)}
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
