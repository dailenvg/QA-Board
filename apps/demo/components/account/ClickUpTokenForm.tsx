"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type { ClickUpTeam } from "@/lib/integrations/clickup/api";
import { connectClickUpToken } from "@/lib/integrations/clickup/settings-client";
import { isClickUpTokenShape } from "@/lib/integrations/clickup/token-shape";
import { usePopVariants } from "@/lib/motion";
import { AuthField } from "../auth/AuthField";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ClickUpTeamChoice } from "./ClickUpTeamChoice";
import { clickUpErrorMessage, INTEGRATIONS_COPY, type ClickUpNotice } from "./integrations-copy";

const COPY = INTEGRATIONS_COPY.clickUp;

/** Why the typed token can't be sent yet, or null. */
function tokenProblem(token: string): string | null {
  if (!token.trim()) return COPY.token.required;
  return isClickUpTokenShape(token) ? null : COPY.token.shape;
}

/**
 * The owner's connect form: a personal API token (hidden like a password,
 * with Show; its shape checked as the field loses focus), sent to Squint,
 * which checks it with ClickUp. A token that reaches several ClickUp
 * workspaces opens a choice of them here, and Connect sends it again with
 * the one picked. Editing the token closes the choice. Once connected the
 * page reads the workspace again; the token is never shown back.
 *
 * Focus follows what needs an answer: the token field when it's refused, the
 * choice (its picked option, else its first) when it opens or still needs a
 * pick, and the row via `onConnected` once this form is about to go.
 */
export function ClickUpTokenForm({
  onNotice,
  onConnected,
}: {
  onNotice: (notice: ClickUpNotice | null) => void;
  /** Connected: this form is about to leave, so focus moves somewhere that stays. */
  onConnected: () => void;
}) {
  const router = useRouter();
  const variants = usePopVariants();
  const tokenRef = useRef<HTMLInputElement>(null);
  const choiceRef = useRef<HTMLFieldSetElement>(null);
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [teams, setTeams] = useState<readonly ClickUpTeam[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The connected view replaces the form once the refresh lands; until then it still reads Connecting….
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  /** Bumped to move focus into the choice once it has rendered (it may have just opened). */
  const [focusChoice, setFocusChoice] = useState(0);

  useEffect(() => {
    if (focusChoice === 0) return;
    const options = Array.from(
      choiceRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [],
    );
    (options.find((option) => option.checked) ?? options[0])?.focus();
  }, [focusChoice]);

  const refuseToken = (message: string) => {
    setTokenError(message);
    setTeams(null);
    setPicked(null);
    tokenRef.current?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = tokenProblem(token);
    if (problem) {
      refuseToken(problem);
      return;
    }
    if (teams && !picked) {
      setChoiceError(COPY.choose.pickFirst);
      setFocusChoice((count) => count + 1);
      return;
    }
    setSaving(true);
    onNotice(null);
    const outcome = await connectClickUpToken(token, picked ?? undefined);
    if (outcome.ok === true) {
      onNotice({ tone: "info", message: COPY.connected });
      onConnected();
      startRefresh(() => router.refresh());
      setSaving(false);
      return;
    }
    setSaving(false);
    if (outcome.ok === "choose") {
      setTeams(outcome.teams);
      setFocusChoice((count) => count + 1);
      return;
    }
    const message = clickUpErrorMessage(outcome.error, outcome.retryAfterSeconds);
    if (outcome.error === "refused" || outcome.error === "no-workspace") refuseToken(message);
    else if (outcome.error === "unknown-team") {
      setTeams(outcome.teams ?? teams);
      setPicked(null);
      setChoiceError(message);
      setFocusChoice((count) => count + 1);
    } else onNotice({ tone: "error", message });
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={busy}
      className="flex flex-col gap-4"
      data-testid="clickup-token-form"
    >
      <AuthField
        label={COPY.token.label}
        type="password"
        // "off", not "new-password": that one invites browsers to suggest a generated password.
        autoComplete="off"
        notAPassword
        secretNoun="token"
        name="clickupToken"
        inputRef={tokenRef}
        value={token}
        error={tokenError}
        hint={COPY.token.hint}
        readOnly={busy}
        onChange={(value) => {
          setToken(value);
          if (tokenError) setTokenError(value.trim() ? tokenProblem(value) : null);
          if (teams) {
            setTeams(null);
            setPicked(null);
            setChoiceError(null);
          }
        }}
        onBlur={() => setTokenError(token.trim() ? tokenProblem(token) : null)}
        testId="clickup-token"
      />
      <AnimatePresence initial={false}>
        {teams ? (
          <motion.div
            key="choice"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <ClickUpTeamChoice
              groupRef={choiceRef}
              teams={teams}
              value={picked}
              onChange={(teamId) => {
                setPicked(teamId);
                setChoiceError(null);
              }}
              error={choiceError}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button
        type="submit"
        aria-disabled={busy || undefined}
        className="self-start max-sm:self-stretch"
        data-testid="clickup-connect"
      >
        <Icon name="link" className="size-5" />
        {busy ? COPY.connecting : teams ? COPY.choose.submit : COPY.connect}
      </Button>
    </form>
  );
}
