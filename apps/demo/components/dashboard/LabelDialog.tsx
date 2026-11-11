"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { usePopVariants } from "@/lib/motion";
import { WORKSPACE_LIMITS } from "@/lib/workspace/limits";
import type { Project } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";

/** Most suggestions shown at once; typing narrows them. */
const SUGGESTIONS = 8;

const COPY = {
  titleAdd: "Add a label",
  titleChange: "Change label",
  field: "Label",
  hint: `One label per project, up to ${WORKSPACE_LIMITS.label} characters.`,
  suggestions: "Used in this workspace",
  empty: "Enter a label.",
  emptyWithRemove: "Enter a label, or remove the one it has.",
  /** A suggestion's accessible name; its visible text stays the label. */
  suggestionName: (label: string) => `Use label: ${label}`,
  remove: "Remove label",
  cancel: "Cancel",
  save: "Save label",
} as const;

interface LabelDialogProps {
  open: boolean;
  project: Project | null;
  /** Labels already used in the workspace, A to Z: offered as suggestions. */
  labels: readonly string[];
  onClose: () => void;
  /** Sets the label, or removes it with null. */
  onSave: (label: string | null) => void;
}

/** Gives a project its one label: typed, or picked from those in use; or takes it away. */
export function LabelDialog({ open, project, labels, onClose, onSave }: LabelDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project?.label ? COPY.titleChange : COPY.titleAdd}
      description={project?.name}
      size="sm"
      testId="label-dialog"
    >
      {project ? (
        <LabelForm
          key={project.id}
          current={project.label ?? null}
          labels={labels}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </Dialog>
  );
}

interface LabelFormProps {
  current: string | null;
  labels: readonly string[];
  onClose: () => void;
  onSave: (label: string | null) => void;
}

/** Suggestions containing what's typed (case aside), the current label left out. */
function suggestionsFor(labels: readonly string[], typed: string, current: string | null) {
  const query = typed.trim().toLocaleLowerCase();
  return labels
    .filter((label) => label !== current && label.toLocaleLowerCase().includes(query))
    .slice(0, SUGGESTIONS);
}

function LabelForm({ current, labels, onClose, onSave }: LabelFormProps) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const listId = useId();
  const variants = usePopVariants();
  const reduce = useReducedMotion();
  const suggestions = useMemo(
    () => suggestionsFor(labels, value, current),
    [labels, value, current],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const label = value.trim();
    if (!label) {
      setError(current ? COPY.emptyWithRemove : COPY.empty);
      return;
    }
    onSave(label);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
          {COPY.field}
        </label>
        <input
          id={inputId}
          data-autofocus
          value={value}
          maxLength={WORKSPACE_LIMITS.label}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${hintId} ${errorId}`}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onFocus={(event) => event.currentTarget.select()}
          className={FIELD_CLASS}
        />
        <p id={hintId} className="mt-2 text-meta text-muted">
          {COPY.hint}
        </p>
        <FieldError id={errorId} message={error} />
      </div>

      {labels.some((label) => label !== current) ? (
        <div>
          <p id={listId} className="mb-2 text-label font-semibold text-ink-2">
            {COPY.suggestions}
          </p>
          {/* `relative`: popLayout positions leaving suggestions against this list. */}
          <ul aria-labelledby={listId} className="relative flex min-h-11 flex-wrap gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {suggestions.map((label) => (
                <motion.li
                  key={label}
                  // The rest close ranks as typing narrows them; with reduced motion they jump.
                  layout={!reduce}
                  variants={variants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="max-w-full min-w-0"
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSave(label)}
                    aria-label={COPY.suggestionName(label)}
                    data-testid="label-suggestion"
                    className="max-w-full"
                  >
                    <Icon name="tag" className="size-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {current ? (
          <Button
            variant="danger-ghost"
            onClick={() => onSave(null)}
            data-testid="label-remove"
            className="sm:mr-auto"
          >
            <Icon name="close" className="size-4" />
            {COPY.remove}
          </Button>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
          <Button variant="secondary" onClick={onClose}>
            {COPY.cancel}
          </Button>
          <Button type="submit" data-testid="label-save">
            {COPY.save}
          </Button>
        </div>
      </div>
    </form>
  );
}
