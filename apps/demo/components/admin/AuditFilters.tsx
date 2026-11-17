"use client";

import { useId } from "react";
import { SQUINT_ACTOR, type AuditFilters as Filters } from "@/lib/admin/audit-href";
import type { AuditFilterOptions } from "@/lib/admin/audit-query";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Select, type SelectOption } from "../ui/Select";
import { ADMIN_COPY, actionLabel } from "./admin-copy";

const COPY = ADMIN_COPY.audit;

interface AuditFiltersProps {
  filters: Filters;
  options: AuditFilterOptions;
  onChange: (filters: Filters) => void;
}

/** `options`, with `value` added when it isn't among them (a link to a filter nothing matches). */
function including(
  options: SelectOption[],
  value: string | undefined,
  label: (value: string) => string,
) {
  if (!value || options.some((option) => option.value === value)) return options;
  return [...options, { value, label: label(value) }];
}

function workspaceOptions({ workspaces }: AuditFilterOptions, value?: string): SelectOption[] {
  const known = workspaces.map((workspace) => ({
    value: workspace.id,
    label: workspace.name ?? COPY.goneWorkspace(workspace.id),
  }));
  return [{ value: "", label: COPY.allWorkspaces }, ...including(known, value, COPY.goneWorkspace)];
}

function actorOptions({ actors, squint }: AuditFilterOptions, value?: string): SelectOption[] {
  const people = actors.map((actor) => ({
    value: actor.id,
    label: actor.name ? `${actor.name} (${actor.email})` : actor.email,
  }));
  const automatic =
    squint || value === SQUINT_ACTOR ? [{ value: SQUINT_ACTOR, label: COPY.squintNote }] : [];
  return [
    { value: "", label: COPY.everyone },
    ...automatic,
    ...including(people, value === SQUINT_ACTOR ? undefined : value, COPY.unknownPerson),
  ];
}

function actionOptions({ actions }: AuditFilterOptions, value?: string): SelectOption[] {
  const known = actions.map((action) => ({ value: action, label: actionLabel(action) }));
  return [{ value: "", label: COPY.allActions }, ...including(known, value, actionLabel)];
}

/**
 * The log's filters: workspace, who did it, and which action. Each choice
 * applies at once (a new URL, so the view is a link); Clear filters shows
 * everything again.
 */
export function AuditFilters({ filters, options, onChange }: AuditFiltersProps) {
  const id = useId();
  const set = (key: keyof Filters) => (value: string) =>
    onChange({ ...filters, [key]: value || undefined });
  const fields = [
    {
      key: "workspace",
      label: COPY.workspace,
      options: workspaceOptions(options, filters.workspace),
    },
    { key: "actor", label: COPY.actor, options: actorOptions(options, filters.actor) },
    { key: "action", label: COPY.action, options: actionOptions(options, filters.action) },
  ] as const;
  const filtered = Boolean(filters.workspace || filters.actor || filters.action);
  return (
    <div className="flex flex-col gap-4" data-testid="audit-filters">
      <div className="grid gap-4 md:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className="flex min-w-0 flex-col gap-2">
            <label htmlFor={`${id}-${field.key}`} className="text-body font-semibold">
              {field.label}
            </label>
            <Select
              id={`${id}-${field.key}`}
              value={filters[field.key] ?? ""}
              options={field.options}
              onChange={set(field.key)}
              testId={`audit-filter-${field.key}`}
            />
          </div>
        ))}
      </div>
      {filtered ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange({})}
          data-testid="audit-clear"
          className="self-start max-sm:self-stretch"
        >
          <Icon name="close" className="size-4" />
          {COPY.clear}
        </Button>
      ) : null}
    </div>
  );
}
