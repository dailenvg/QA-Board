"use client";

import type { ClickUpSection } from "@/lib/integrations/clickup/section";
import { ClickUpIntegration } from "./ClickUpIntegration";
import { INTEGRATIONS_COPY } from "./integrations-copy";
import { SettingsCard } from "./SettingsCard";

interface IntegrationsSettingsProps {
  clickUp: ClickUpSection;
  isOwner: boolean;
}

/** The workspace's connections to other tools, for every member to see; the owner manages them. */
export function IntegrationsSettings({ clickUp, isOwner }: IntegrationsSettingsProps) {
  return (
    <SettingsCard
      title={INTEGRATIONS_COPY.title}
      description={INTEGRATIONS_COPY.description}
      icon="link"
      testId="integrations-settings"
    >
      <ClickUpIntegration section={clickUp} isOwner={isOwner} />
    </SettingsCard>
  );
}
