"use client";

import type { Folder, Project } from "@/lib/store/types";
import { Dialog } from "../ui/Dialog";
import { NewProjectForm } from "./NewProjectForm";

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  folders: readonly Folder[];
  /** Folder preselected when the dialog opens. */
  defaultFolderId: string;
  onCreated: (project: Project) => void;
}

export function NewProjectDialog({ open, onClose, ...formProps }: NewProjectDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="Review a live website or a static image."
      testId="new-project-dialog"
    >
      <NewProjectForm onCancel={onClose} {...formProps} />
    </Dialog>
  );
}
