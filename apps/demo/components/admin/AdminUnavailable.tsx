"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormAlert } from "../auth/FormAlert";
import { SettingsCard } from "../account/SettingsCard";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.unavailable;

/** An admin page that couldn't be read: what happened, and a way to try again. */
export function AdminUnavailable({ title }: { title: string }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <SettingsCard
      title={title}
      description={COPY.description}
      icon="alert"
      testId="admin-unavailable"
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={COPY.body} />
        <Button
          variant="secondary"
          onClick={() => {
            if (!retrying) startRetry(() => router.refresh());
          }}
          aria-disabled={retrying || undefined}
          className="self-start max-sm:self-stretch"
        >
          <Icon name="refresh" className="size-5" />
          {retrying ? COPY.retrying : COPY.retry}
        </Button>
      </div>
    </SettingsCard>
  );
}
