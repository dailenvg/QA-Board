"use client";

import { useState } from "react";
import { LOGO_MAX_ASPECT } from "@/lib/account/image-rules";
import type { WorkspaceSettings as Settings } from "@/lib/account/workspace-settings";
import { workspaceLogoSrc } from "@/lib/routes";
import { MonogramTile } from "../brand/MonogramTile";
import { ImageUploader } from "./ImageUploader";
import { SettingsCard } from "./SettingsCard";
import { WorkspaceForm } from "./WorkspaceForm";

interface WorkspaceSettingsProps {
  settings: Settings;
  /** Only the owner changes them; anyone else is told so. */
  isOwner: boolean;
}

/**
 * The workspace section: its logo, then its name, brand color and sender
 * name with a preview of what guests see. The logo saves on its own, and the
 * preview shows the new one at once.
 */
export function WorkspaceSettings({ settings, isOwner }: WorkspaceSettingsProps) {
  const [logoVersion, setLogoVersion] = useState(settings.logoVersion);
  if (!isOwner) {
    return (
      <SettingsCard
        title={settings.name}
        description="Only the workspace's owner can change its name, logo and brand. Ask them if something needs updating."
        icon="lock"
        testId="workspace-settings"
      >
        {null}
      </SettingsCard>
    );
  }
  const logoSrc = logoVersion && workspaceLogoSrc(logoVersion);
  return (
    <div className="flex flex-col gap-4" data-testid="workspace-settings">
      <SettingsCard
        title="Logo"
        description="Shown to guests at the top of your review links and on their link previews. Without one, your workspace's initials stand in, on your brand color."
        icon="image"
        testId="workspace-logo-settings"
      >
        <ImageUploader
          kind="logo"
          target="logo"
          noun="logo"
          src={logoSrc}
          fallback={
            <MonogramTile
              name={settings.name}
              color={settings.brandColor}
              className="size-full text-display"
            />
          }
          onChange={setLogoVersion}
          hint={`A PNG, JPG or WebP, no more than ${LOGO_MAX_ASPECT} times as wide as it is tall. You'll size and position it next. Transparent backgrounds stay transparent.`}
          testId="logo"
        />
      </SettingsCard>
      <WorkspaceForm
        initial={{
          name: settings.name,
          brandColor: settings.brandColor,
          senderName: settings.senderName,
        }}
        slug={settings.slug}
        logoSrc={logoSrc}
      />
    </div>
  );
}
