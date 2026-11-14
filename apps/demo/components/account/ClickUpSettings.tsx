"use client";

import type { ClickUpSection } from "@/lib/integrations/clickup/section";
import { ClickUpIntegration } from "./ClickUpIntegration";
import { ClickUpLogo } from "./ClickUpLogo";
import { INTEGRATIONS_COPY } from "./integrations-copy";
import { SettingsCard } from "./SettingsCard";

/**
 * The profile's ClickUp card: the member's own connection, for Send to
 * ClickUp in the project viewer. Nobody else in the workspace sees it.
 */
export function ClickUpSettings({ section }: { section: ClickUpSection }) {
  return (
    <SettingsCard
      title={INTEGRATIONS_COPY.title}
      description={INTEGRATIONS_COPY.description}
      mark={<ClickUpLogo className="size-5" />}
      testId="clickup-settings"
      anchorId="clickup"
    >
      <ClickUpIntegration section={section} />
    </SettingsCard>
  );
}
