"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { displayNameError } from "@/lib/account/field-rules";
import { confirmPasswordError, newPasswordError } from "@/lib/auth/field-rules";
import { requestJoin, type JoinError } from "@/lib/auth/join-client";
import { JOINED_PATH } from "@/lib/auth/next-path";
import type { JoinBrand } from "@/lib/workspace/members/join-page";
import { Button } from "../ui/Button";
import { AuthField } from "./AuthField";
import { AuthPanel } from "./AuthPanel";
import { FormAlert } from "./FormAlert";
import { JOIN_COPY } from "./join-copy";

const COPY = JOIN_COPY.newPerson;

interface JoinFormProps {
  token: string;
  brand: JoinBrand;
  email: string;
  inviter: string | null;
  /** A refused submit posted before the page hydrated (from `?error=`). */
  initialError: string | null;
  focusTitle: boolean;
  /**
   * What the page does with a refusal: swaps to that state's panel, or
   * refreshes (both answer null), or gives the form a message to show.
   */
  onRefused: (error: JoinError, retryAfterSeconds?: number) => string | null;
  footer: ReactNode;
}

interface FieldErrors {
  name: string | null;
  password: string | null;
  confirm: string | null;
}

const NONE: FieldErrors = { name: null, password: null, confirm: null };

/**
 * A new person joining with an invite (4b.6): the invited address as text
 * (not a field that looks editable), then a name and a password, twice. It
 * posts JSON once hydrated, and is a plain form post before that. Joined, a
 * full page load to the Overview, so the new session's cookie is used.
 */
export function JoinForm({
  token,
  brand,
  email,
  inviter,
  initialError,
  focusTitle,
  onRefused,
  footer,
}: JoinFormProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>(NONE);
  const [formError, setFormError] = useState<string | null>(initialError);
  const [status, setStatus] = useState<"idle" | "joining">("idle");
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status !== "idle") return;
    const found = {
      name: displayNameError(name),
      password: newPasswordError(password),
      confirm: confirmPasswordError(password, confirm),
    };
    setErrors(found);
    const first = found.name ? nameRef : found.password ? passwordRef : found.confirm && confirmRef;
    if (first) {
      first.current?.focus();
      return;
    }
    setStatus("joining");
    setFormError(null);
    const outcome = await requestJoin(token, { name: name.trim(), password });
    if (outcome.ok) {
      window.location.assign(JOINED_PATH);
      return;
    }
    setStatus("idle");
    setFormError(onRefused(outcome.error, outcome.retryAfterSeconds));
  };

  return (
    <AuthPanel
      title={COPY.title(brand.workspace)}
      description={COPY.line(inviter, brand.workspace)}
      mood={status === "idle" ? (formError ? "surprised" : "idle") : "thinking"}
      brand={{ name: brand.workspace, color: brand.color, logoSrc: brand.logoSrc }}
      focusTitle={focusTitle}
      footer={footer}
    >
      {/* method and action: a submit before hydration posts the fields, never into the address. */}
      <form
        method="post"
        action="/api/auth/join"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={status !== "idle"}
        className="flex flex-col gap-5"
        data-testid="join-form"
      >
        <input type="hidden" name="token" value={token} />
        {/* For password managers: the account the new password belongs to. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          <p className="mb-2 text-body font-semibold">{COPY.email}</p>
          <p
            className="flex min-h-11 items-center rounded-field bg-tile px-4 text-nav text-ink-2 wrap-anywhere"
            data-testid="join-email"
          >
            {email}
          </p>
        </div>
        <AuthField
          label={COPY.name}
          type="text"
          autoComplete="name"
          name="name"
          autoFocus
          inputRef={nameRef}
          hint={COPY.nameHint}
          value={name}
          error={errors.name}
          readOnly={status !== "idle"}
          onChange={(value) => {
            setName(value);
            if (errors.name)
              setErrors((current) => ({ ...current, name: displayNameError(value) }));
          }}
          onBlur={() =>
            setErrors((current) => ({ ...current, name: name ? displayNameError(name) : null }))
          }
        />
        <AuthField
          label={COPY.password}
          type="password"
          autoComplete="new-password"
          name="password"
          inputRef={passwordRef}
          hint={COPY.passwordHint}
          value={password}
          error={errors.password}
          readOnly={status !== "idle"}
          onChange={(value) => {
            setPassword(value);
            if (errors.password) {
              setErrors((current) => ({ ...current, password: newPasswordError(value) }));
            }
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              password: password ? newPasswordError(password) : null,
            }))
          }
        />
        <AuthField
          label={COPY.again}
          type="password"
          autoComplete="new-password"
          name="confirm"
          inputRef={confirmRef}
          value={confirm}
          error={errors.confirm}
          readOnly={status !== "idle"}
          onChange={(value) => {
            setConfirm(value);
            if (errors.confirm) {
              setErrors((current) => ({
                ...current,
                confirm: confirmPasswordError(password, value),
              }));
            }
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              confirm: confirm ? confirmPasswordError(password, confirm) : current.confirm,
            }))
          }
        />
        <FormAlert message={formError} testId="join-error" />
        <Button
          type="submit"
          aria-disabled={status !== "idle" || undefined}
          data-testid="join-submit"
        >
          {status === "idle" ? JOIN_COPY.join.button(brand.workspace) : JOIN_COPY.join.pending}
        </Button>
      </form>
    </AuthPanel>
  );
}
