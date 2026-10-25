"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { duration, ease } from "@/lib/motion";
import { flattenFolderTree } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";

export const NEW_FOLDER = "__new__";

interface FolderPickerProps {
  folders: readonly Folder[];
  value: string;
  onChange: (value: string) => void;
  newName: string;
  onNewName: (value: string) => void;
  /** Validates the new folder name when focus leaves it. */
  onNewNameBlur: () => void;
  newNameError: string | null;
}

/** Folder select (the folder tree, indented) with an inline "New folder" option that reveals a name field. */
export function FolderPicker({
  folders,
  value,
  onChange,
  newName,
  onNewName,
  onNewNameBlur,
  newNameError,
}: FolderPickerProps) {
  const selectId = useId();
  const nameId = useId();
  const errorId = useId();
  const reduce = useReducedMotion();
  return (
    <div>
      <label htmlFor={selectId} className="mb-2 block text-body font-semibold">
        Folder
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
      >
        {flattenFolderTree(folders).map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {/* Nested folders are indented under their parents (non-breaking spaces show in a select). */}
            {`${"\u00a0".repeat(depth * 3)}${folder.name}`}
          </option>
        ))}
        <option value={NEW_FOLDER}>New folder…</option>
      </select>
      <AnimatePresence initial={false}>
        {value === NEW_FOLDER ? (
          <motion.div
            key="new-folder"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : duration.component, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <label htmlFor={nameId} className="mb-2 block text-body font-semibold">
                New folder name
              </label>
              <input
                id={nameId}
                autoFocus
                required
                value={newName}
                onBlur={onNewNameBlur}
                maxLength={80}
                autoComplete="off"
                aria-invalid={newNameError ? true : undefined}
                aria-describedby={errorId}
                onChange={(event) => onNewName(event.target.value)}
                className={FIELD_CLASS}
              />
              <FieldError id={errorId} message={newNameError} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
