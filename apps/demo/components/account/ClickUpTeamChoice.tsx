"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, type Ref } from "react";
import type { ClickUpTeam } from "@/lib/integrations/clickup/api";
import { instant, spring } from "@/lib/motion";
import { FieldError } from "../ui/FieldError";
import { INTEGRATIONS_COPY } from "./integrations-copy";

interface ClickUpTeamChoiceProps {
  /** The ClickUp workspaces the token reaches, in ClickUp's order. */
  teams: readonly ClickUpTeam[];
  value: string | null;
  onChange: (teamId: string) => void;
  error: string | null;
  /** The group, for the form to move focus to its options. */
  groupRef?: Ref<HTMLFieldSetElement>;
}

/**
 * Which of a token's ClickUp workspaces to connect, as radio cards (as in
 * `CombineChoice`): the picked one's ring glides to it (jumps with reduced motion).
 */
export function ClickUpTeamChoice({
  teams,
  value,
  onChange,
  error,
  groupRef,
}: ClickUpTeamChoiceProps) {
  const reduce = useReducedMotion();
  const name = useId();
  const errorId = useId();
  return (
    <fieldset ref={groupRef} aria-describedby={errorId} data-testid="clickup-team-choice">
      <legend className="mb-3 block text-body font-semibold text-pretty">
        {INTEGRATIONS_COPY.clickUp.choose.legend}
      </legend>
      <div className="flex flex-col gap-2">
        {teams.map((team) => {
          const selected = team.id === value;
          return (
            <label
              key={team.id}
              data-testid={`clickup-team-${team.id}`}
              className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-tile px-4 py-3 pr-12 transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${
                selected
                  ? "bg-brand-soft"
                  : "bg-card ring-1 ring-line ring-inset hover:ring-brand-text"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId={`clickup-team-${name}`}
                  transition={reduce ? instant : spring.snappy}
                  className="pointer-events-none absolute inset-0 rounded-tile ring-2 ring-brand-text"
                />
              ) : null}
              <input
                type="radio"
                name={name}
                value={team.id}
                checked={selected}
                onChange={() => onChange(team.id)}
                className="sr-only"
              />
              {/* A radio mark, so the choice reads without telling the colors apart (WCAG 1.4.1). */}
              <span
                aria-hidden="true"
                className={`absolute top-1/2 right-4 grid size-5 -translate-y-1/2 place-items-center rounded-pill ring-2 ring-inset ${
                  selected ? "ring-brand-text" : "ring-field-line"
                }`}
              >
                {selected ? <span className="size-2 rounded-pill bg-brand-text" /> : null}
              </span>
              <span className="relative min-w-0 text-body font-semibold wrap-anywhere">
                {team.name}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
