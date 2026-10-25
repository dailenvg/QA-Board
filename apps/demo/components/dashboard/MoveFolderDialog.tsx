"use client";

import { useState, type FormEvent } from "react";
import { folderMoveProblem } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FolderTreePicker, TOP_LEVEL } from "./FolderTreePicker";

interface MoveFolderDialogProps {
  open: boolean;
  folder: Folder | null;
  folders: readonly Folder[];
  /** `parentId` null: the top level. */
  onMove: (parentId: string | null) => void;
  onClose: () => void;
}

/** Short reasons for the picker: a folder can't go inside itself or its subfolders. */
function reason(folders: readonly Folder[], folder: Folder, value: string): string | null {
  const parentId = value === TOP_LEVEL ? null : value;
  if (parentId === folder.id) return "This folder";
  const problem = folderMoveProblem(folders, folder.id, parentId);
  if (!problem) return null;
  return problem.includes("subfolders") ? "Inside this folder" : "Already here";
}

/** Picks where a folder goes: another folder, or the top level. */
export function MoveFolderDialog({
  open,
  folder,
  folders,
  onMove,
  onClose,
}: MoveFolderDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move folder"
      description={
        folder
          ? `Choose where ${folder.name} goes. Its subfolders and projects move with it.`
          : undefined
      }
      size="sm"
      testId="move-folder-dialog"
    >
      {folder ? (
        <MoveForm folder={folder} folders={folders} onMove={onMove} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function MoveForm({
  folder,
  folders,
  onMove,
  onClose,
}: Omit<MoveFolderDialogProps, "open" | "folder"> & { folder: Folder }) {
  const problemFor = (value: string) => reason(folders, folder, value);
  const first = [TOP_LEVEL, ...folders.map((entry) => entry.id)].find(
    (value) => !problemFor(value),
  );
  const [value, setValue] = useState(first ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value && !problemFor(value)) onMove(value === TOP_LEVEL ? null : value);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FolderTreePicker
        legend="Move into"
        folders={folders}
        value={value}
        onChange={setValue}
        topLevel
        problemFor={problemFor}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!value} data-testid="move-folder-submit">
          Move folder
        </Button>
      </div>
    </form>
  );
}
