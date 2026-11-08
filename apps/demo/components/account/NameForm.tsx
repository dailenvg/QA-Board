"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { accountErrorMessage, saveDisplayName } from "@/lib/account/account-client";
import { displayNameError, NAME_MAX_LENGTH } from "@/lib/account/field-rules";
import { AuthField } from "../auth/AuthField";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { SettingsCard } from "./SettingsCard";
import { useCheckedField } from "./use-checked-field";

type Status = "idle" | "saving" | "saved";

/** The name shown on the user's comments. */
export function NameForm({ initialName }: { initialName: string | null }) {
  const router = useRouter();
  const name = useCheckedField(displayNameError, initialName ?? "");
  const [savedName, setSavedName] = useState(initialName ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unchanged = name.value.trim() === savedName;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "saving" || unchanged) return;
    if (name.check()) {
      inputRef.current?.focus();
      return;
    }
    setStatus("saving");
    setFormError(null);
    const trimmed = name.value.trim();
    const outcome = await saveDisplayName(trimmed);
    if (!outcome.ok) {
      setStatus("idle");
      setFormError(accountErrorMessage(outcome.error));
      return;
    }
    setSavedName(trimmed);
    name.field.onChange(trimmed);
    setStatus("saved");
    router.refresh();
  };

  return (
    <SettingsCard
      title="Name"
      description="Shown on the comments you leave, to you and to anyone you share a review link with."
      icon="user"
      testId="name-settings"
    >
      {/* method="post": a submit before hydration reloads the page, never puts fields in its URL. */}
      <form
        method="post"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={status === "saving"}
        className="flex flex-col gap-4"
      >
        <AuthField
          label="Name"
          type="text"
          autoComplete="name"
          name="name"
          inputRef={inputRef}
          hint={`Up to ${NAME_MAX_LENGTH} characters.`}
          {...name.field}
          onChange={(value) => {
            name.field.onChange(value);
            if (status === "saved") setStatus("idle");
          }}
          testId="account-name"
        />
        {/* The alerts take room only while they show. */}
        <div className="flex flex-col">
          <FormAlert className="has-[p]:mb-4" message={formError} testId="name-error" />
          <FormAlert
            className="has-[p]:mb-4"
            tone="info"
            message={status === "saved" ? "Name saved." : null}
            testId="name-saved"
          />
          <Button
            type="submit"
            aria-disabled={status === "saving" || unchanged || undefined}
            className="self-start max-sm:self-stretch"
            data-testid="save-name"
          >
            {status === "saving" ? "Saving…" : "Save name"}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
