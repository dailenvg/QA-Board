"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { SettingsCard } from "./SettingsCard";

/** A settings section that couldn't be read: what happened, and a way to try again. */
export function SettingsUnavailable({ title }: { title: string }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <SettingsCard
      title={title}
      description="These settings couldn't be loaded."
      icon="alert"
      testId="settings-unavailable"
    >
      <div className="flex flex-col gap-4">
        <FormAlert message="Squint couldn't read them just now. Your settings are safe; try again in a moment." />
        <Button
          variant="secondary"
          onClick={() => startRetry(() => router.refresh())}
          aria-disabled={retrying || undefined}
          className="self-start max-sm:self-stretch"
        >
          <Icon name="refresh" className="size-5" />
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      </div>
    </SettingsCard>
  );
}
