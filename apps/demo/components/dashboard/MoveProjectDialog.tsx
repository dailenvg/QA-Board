"use client";

import { useState, type FormEvent } from "react";
import type { Folder, Project } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FolderTreePicker } from "./FolderTreePicker";

interface MoveProjectDialogProps {
  open: boolean;
  project: Project | null;
  folders: readonly Folder[];
  onMove: (folderId: string) => void;
  onClose: () => void;
}

/** Picks another folder for a project, in the folder tree. */
export function MoveProjectDialog({
  open,
  project,
  folders,
  onMove,
  onClose,
}: MoveProjectDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move project"
      description={project ? `Choose a folder for ${project.name}.` : undefined}
      size="sm"
    >
      {project ? (
        <MoveForm project={project} folders={folders} onMove={onMove} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function MoveForm({
  project,
  folders,
  onMove,
  onClose,
}: Omit<MoveProjectDialogProps, "open" | "project"> & { project: Project }) {
  const problemFor = (value: string) => (value === project.folderId ? "Already here" : null);
  const others = folders.filter((folder) => folder.id !== project.folderId);
  const [folderId, setFolderId] = useState(others[0]?.id ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (folderId) onMove(folderId);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FolderTreePicker
        legend="Folder"
        folders={folders}
        value={folderId}
        onChange={setFolderId}
        topLevel={false}
        problemFor={problemFor}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!folderId}>
          Move
        </Button>
      </div>
    </form>
  );
}
