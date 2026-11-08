"use client";

import { useState } from "react";
import { IMAGE_MAX_EDGE } from "@/lib/account/image-rules";
import { personMonogramName } from "@/lib/monogram";
import { avatarSrc } from "@/lib/routes";
import { MonogramTile } from "../brand/MonogramTile";
import { ImageUploader } from "./ImageUploader";
import { SettingsCard } from "./SettingsCard";

interface AvatarFormProps {
  /** For the monogram without a photo: the user's name, else their email. */
  name: string | null;
  email: string;
  /** The current avatar's `?v=`, or null without one. */
  initialVersion: string | null;
}

/** The user's photo, shown with their account in the workspace's sidebar. */
export function AvatarForm({ name, email, initialVersion }: AvatarFormProps) {
  const [version, setVersion] = useState(initialVersion);
  return (
    <SettingsCard
      title="Photo"
      description="Shown with your account in Squint's sidebar. Without one, your initials stand in."
      icon="camera"
      testId="avatar-settings"
    >
      <ImageUploader
        kind="avatar"
        target="avatar"
        noun="photo"
        src={version && avatarSrc(version)}
        fallback={
          <MonogramTile
            name={personMonogramName(name, email)}
            color={null}
            className="size-full text-title"
          />
        }
        onChange={setVersion}
        hint={`A PNG, JPG or WebP. We'll crop it square and resize it to fit ${IMAGE_MAX_EDGE} px.`}
        testId="avatar"
      />
    </SettingsCard>
  );
}
