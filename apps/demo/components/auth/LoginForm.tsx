"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { loginErrorMessage, RESET_LINK, requestLogin } from "@/lib/auth/auth-client";
import { emailError, passwordError } from "@/lib/auth/field-rules";
import { withWelcome } from "@/lib/auth/next-path";
import { forgetImportDeferral } from "@/lib/workspace-client/import-deferral";
import type { Mood } from "../brand/mascot/moods";
import { Button } from "../ui/Button";
import { AuthField } from "./AuthField";
import { AuthPanel } from "./AuthPanel";
import { FormAlert } from "./FormAlert";
import { TextLink } from "./TextLink";

interface LoginFormProps {
  /** Where to go once signed in (already checked to be on this site). */
  next: string;
  /** Why the page was opened: a completed password reset, an email change, a sign-out everywhere. */
  notice: string | null;
  /** A failed sign-in that was posted before the page hydrated (from `?error=`). */
  initialError: string | null;
}

type Status = "idle" | "submitting" | "signed-in";

interface FieldErrors {
  email: string | null;
  password: string | null;
}

const NO_ERRORS: FieldErrors = { email: null, password: null };

/** What the last refusal was: nothing, a mistake to fix, or a removed account (nothing to fix). */
type Failure = "none" | "mistake" | "removed";

const REMOVED_MESSAGE = loginErrorMessage("removed");

function failureOf(message: string | null): Failure {
  if (message === null) return "none";
  return message === REMOVED_MESSAGE ? "removed" : "mistake";
}

function moodFor(status: Status, failure: Failure): Mood {
  if (status === "signed-in") return "happy";
  if (status === "submitting" || failure === "removed") return "thinking";
  return failure === "mistake" ? "surprised" : "idle";
}

/** Email and password, checked on blur and on submit; the server's answer shows above the button. */
export function LoginForm({ next, notice, initialError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [formError, setFormError] = useState<string | null>(initialError);
  const [status, setStatus] = useState<Status>("idle");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const busy = status !== "idle";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = { email: emailError(email), password: passwordError(password) };
    setErrors(found);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setStatus("submitting");
    setFormError(null);
    const outcome = await requestLogin(email, password);
    if (outcome.ok) {
      setStatus("signed-in");
      // A new sign-in asks again about importing this browser's local data.
      forgetImportDeferral();
      router.replace(withWelcome(next, outcome.welcome));
      return;
    }
    setStatus("idle");
    setFormError(loginErrorMessage(outcome.error, outcome.retryAfterSeconds));
    if (outcome.error === "invalid-credentials") {
      setPassword("");
      passwordRef.current?.focus();
    } else if (outcome.error === "removed") {
      // The password was right, but typing it again can't help: it's cleared, focus stays put.
      setPassword("");
      submitRef.current?.focus();
    }
  };

  return (
    <AuthPanel
      title="Sign in to Squint"
      description="Use the email and password your workspace was set up with."
      mood={moodFor(status, failureOf(formError))}
      footer={<TextLink href="/reset">Forgot your password?</TextLink>}
    >
      {/*
        method and action: submitted before hydration, the browser posts the fields to the route
        (never into the address); once hydrated, submit sends JSON instead.
      */}
      <form
        method="post"
        action="/api/auth/login"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={busy}
        className="flex flex-col gap-5"
        data-testid="login-form"
      >
        <input type="hidden" name="next" value={next} />
        <FormAlert tone="info" message={notice} testId="login-notice" />
        <AuthField
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          inputRef={emailRef}
          value={email}
          error={errors.email}
          onChange={(value) => {
            setEmail(value);
            if (errors.email) setErrors((current) => ({ ...current, email: emailError(value) }));
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              // Leaving it empty (say, for Forgot your password?) isn't a mistake yet.
              email: email ? emailError(email) : current.email,
            }))
          }
          testId="login-email"
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          inputRef={passwordRef}
          value={password}
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            if (errors.password) {
              setErrors((current) => ({ ...current, password: passwordError(value) }));
            }
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              // Leaving it empty to go back to the email isn't a mistake yet.
              password: password ? passwordError(password) : current.password,
            }))
          }
          testId="login-password"
        />
        <FormAlert message={formError} link={RESET_LINK} testId="login-error" />
        <Button
          ref={submitRef}
          type="submit"
          aria-disabled={busy || undefined}
          data-testid="login-submit"
        >
          {status === "submitting"
            ? "Signing in…"
            : status === "signed-in"
              ? "Signed in"
              : "Sign in"}
        </Button>
      </form>
    </AuthPanel>
  );
}
