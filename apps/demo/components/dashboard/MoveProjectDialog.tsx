"use client";

import { useId, useState, type FormEvent } from "react";
import type { Folder, Project } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FIELD_CLASS } from "../ui/field-styles";

interface MoveProjectDialogProps {
  open: boolean;
  project: Project | null;
  folders: readonly Folder[];
  onMove: (folderId: string) => void;
  onClose: () => void;
}

/** Picks another folder for a project. */
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
  const others = folders.filter((folder) => folder.id !== project.folderId);
  const [folderId, setFolderId] = useState(others[0]?.id ?? "");
  const selectId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (folderId) onMove(folderId);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor={selectId} className="mb-2 block text-body font-semibold">
          Folder
        </label>
        <select
          id={selectId}
          data-autofocus
          value={folderId}
          onChange={(event) => setFolderId(event.target.value)}
          className={FIELD_CLASS}
        >
          {others.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </div>
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
