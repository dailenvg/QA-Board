"use client";

import { useState } from "react";
import { personMonogramName } from "@/lib/monogram";
import { avatarSrc } from "@/lib/routes";
import { PersonMark } from "../avatar/PersonMark";
import { ImageUploader, UPLOADER_TILE_PX } from "./ImageUploader";
import { SettingsCard } from "./SettingsCard";

interface AvatarFormProps {
  /** For the default mark without a photo: the user's name, else their email. */
  name: string | null;
  email: string;
  /** The Squint admin: their own default mark. */
  admin: boolean;
  /** The current avatar's `?v=`, or null without one. */
  initialVersion: string | null;
}

/** The user's photo, shown with their account in the workspace's sidebar. */
export function AvatarForm({ name, email, admin, initialVersion }: AvatarFormProps) {
  const [version, setVersion] = useState(initialVersion);
  return (
    <SettingsCard
      title="Photo"
      description="Shown with your account in Squint's sidebar. Without one, Squint draws an avatar for you."
      icon="camera"
      testId="avatar-settings"
    >
      <ImageUploader
        kind="avatar"
        target="avatar"
        noun="photo"
        src={version && avatarSrc(version)}
        // The sidebar's default mark, drawn large.
        fallback={
          <PersonMark
            label={personMonogramName(name, email)}
            admin={admin}
            size={UPLOADER_TILE_PX}
          />
        }
        onChange={setVersion}
        hint="A PNG, JPG or WebP. You'll size and position it next. It shows as a circle."
        testId="avatar"
      />
    </SettingsCard>
  );
}
