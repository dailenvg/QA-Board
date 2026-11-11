"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { accountErrorMessage, deleteAccount } from "@/lib/account/account-client";
import {
  currentPasswordError,
  deletionConfirmMatches,
  type DeletionConfirm,
} from "@/lib/account/field-rules";
import { AuthField } from "../auth/AuthField";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { DELETE_ACCOUNT_COPY } from "./delete-account-copy";
import { useCheckedField } from "./use-checked-field";

/** Where the browser goes once the account is deleted and every session has ended. */
const DELETED_HREF = "/login?account=deleted";

const COPY = DELETE_ACCOUNT_COPY.dialog;

interface DeleteAccountDialogProps {
  open: boolean;
  confirm: DeletionConfirm;
  /** The sign-in email, for password managers: which account the password belongs to. */
  email: string;
  onClose: () => void;
}

/**
 * Asks for the workspace's name (a member: their email) and the current
 * password, then deletes the account. Stays up while it's deleting. Focus
 * starts in the field to type the confirmation in (as in ConfirmDialog's
 * typed confirm): the delete button can't act until it matches.
 */
export function DeleteAccountDialog({ open, confirm, email, onClose }: DeleteAccountDialogProps) {
  const [pending, setPending] = useState(false);
  const close = () => {
    if (!pending) onClose();
  };
  const description =
    confirm.kind === "workspace"
      ? COPY.description.workspace(confirm.text)
      : COPY.description.email;
  return (
    <Dialog
      open={open}
      onClose={close}
      title={COPY.title}
      description={description}
      size="sm"
      dismissible={!pending}
      testId="delete-account-dialog"
    >
      <DeleteAccountForm
        confirm={confirm}
        email={email}
        pending={pending}
        onPending={setPending}
        onCancel={close}
      />
    </Dialog>
  );
}

interface DeleteAccountFormProps {
  confirm: DeletionConfirm;
  email: string;
  pending: boolean;
  onPending: (pending: boolean) => void;
  onCancel: () => void;
}

function confirmError(value: string, confirm: DeletionConfirm): string | null {
  if (!value.trim()) return COPY.confirmEmpty(confirm.text);
  return deletionConfirmMatches(value, confirm) ? null : COPY.confirmMismatch(confirm.text);
}

/** `sentence`, with `part` in it (if it's there) in bold, so the text to type stands out. */
function emphasized(sentence: string, part: string): ReactNode {
  const at = sentence.indexOf(part);
  if (!part || at < 0) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <strong className="font-bold">{part}</strong>
      {sentence.slice(at + part.length)}
    </>
  );
}

function DeleteAccountForm({
  confirm,
  email,
  pending,
  onPending,
  onCancel,
}: DeleteAccountFormProps) {
  const typed = useCheckedField((value) => confirmError(value, confirm));
  const password = useCheckedField(currentPasswordError);
  const [formError, setFormError] = useState<string | null>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const ready = deletionConfirmMatches(typed.value, confirm) && password.value !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const checks = [
      [typed.check(), typedRef],
      [password.check(), passwordRef],
    ] as const;
    const first = checks.find(([problem]) => problem);
    if (first) {
      first[1].current?.focus();
      return;
    }
    onPending(true);
    setFormError(null);
    const outcome = await deleteAccount(typed.value, password.value);
    if (outcome.ok) {
      // A full page load, not a client navigation: nothing of the ended session carries over.
      window.location.assign(DELETED_HREF);
      return;
    }
    onPending(false);
    if (outcome.error === "wrong-password") {
      password.setError(accountErrorMessage(outcome.error));
      passwordRef.current?.focus();
    } else if (outcome.error === "confirm-mismatch") {
      typed.setError(COPY.confirmMismatch(confirm.text));
      typedRef.current?.focus();
    } else {
      setFormError(accountErrorMessage(outcome.error, outcome.retryAfterSeconds));
    }
  };

  return (
    <form
      method="post"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={pending}
      className="flex flex-col gap-4"
    >
      {/*
        For password managers: which account the password belongs to, so none takes the field
        below for a username and fills it in. tabIndex -1 keeps it out of the Dialog's focus trap,
        which counts tab stops by tabIndex.
      */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
        tabIndex={-1}
      />
      <AuthField
        label={emphasized(COPY.confirmLabel(confirm.text), confirm.text)}
        type={confirm.kind === "email" ? "email" : "text"}
        autoComplete="off"
        // Typed exactly (a workspace's name is case-sensitive): no capitalising keyboard.
        autoCapitalize="none"
        name="confirmText"
        inputRef={typedRef}
        dialogAutofocus
        hint={COPY.confirmHint[confirm.kind]}
        {...typed.field}
        testId="delete-account-confirm"
      />
      <AuthField
        label={COPY.password}
        type="password"
        autoComplete="current-password"
        name="currentPassword"
        inputRef={passwordRef}
        {...password.field}
        testId="delete-account-password"
      />
      <div className="flex flex-col">
        <FormAlert message={formError} testId="delete-account-error" className="has-[p]:mb-4" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onCancel}
            aria-disabled={pending || undefined}
            data-testid="delete-account-cancel"
          >
            {COPY.cancel}
          </Button>
          {/* aria-disabled, not disabled: it stays focusable, and a press explains what's missing. */}
          <Button
            type="submit"
            variant="danger"
            aria-disabled={pending || !ready || undefined}
            data-testid="delete-account-submit"
          >
            {pending ? COPY.submitting : COPY.submit}
          </Button>
        </div>
      </div>
    </form>
  );
}
