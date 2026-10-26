"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { duration, ease } from "@/lib/motion";
import { flattenFolderTree } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { Select } from "../ui/Select";

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

/**
 * Folder picker (the folder tree, indented) with an inline "New folder" option that reveals a
 * name field. With no folders yet, that's the only option, and the field asks for the first one.
 */
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
  const hintId = useId();
  const reduce = useReducedMotion();
  const first = folders.length === 0;
  return (
    <div>
      <label htmlFor={selectId} className="mb-2 block text-body font-semibold">
        Folder
      </label>
      <Select
        id={selectId}
        value={value}
        onChange={onChange}
        testId="folder-picker"
        options={[
          // Nested folders are indented under their parents.
          ...flattenFolderTree(folders).map(({ folder, depth }) => ({
            value: folder.id,
            label: folder.name,
            depth,
          })),
          // With no folders it's the only option, so there's nothing to separate it from.
          { value: NEW_FOLDER, label: "New folder…", icon: "folderPlus", separated: !first },
        ]}
      />
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
                {first ? "Name your first folder" : "New folder name"}
              </label>
              {first ? (
                <p id={hintId} className="-mt-1 mb-2 text-meta text-muted">
                  Projects live in folders. You can add more later.
                </p>
              ) : null}
              <input
                id={nameId}
                autoFocus
                required
                value={newName}
                onBlur={onNewNameBlur}
                maxLength={80}
                autoComplete="off"
                aria-invalid={newNameError ? true : undefined}
                aria-describedby={first ? `${hintId} ${errorId}` : errorId}
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
