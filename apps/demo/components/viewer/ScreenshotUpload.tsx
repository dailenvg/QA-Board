"use client";

import { useId, useState } from "react";
import { ACCEPT_ATTRIBUTE, prepareImage } from "@/lib/image";
import { buttonClass, type ButtonVariant } from "../ui/button-styles";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import type { ScreenshotHandler } from "./types";

interface ScreenshotUploadProps {
  label: string;
  variant?: ButtonVariant;
  /** Receives the prepared image; resolves to an error message when it couldn't be saved. */
  onImage: ScreenshotHandler;
}

/** Button-styled file picker that prepares (downscales) the image before handing it over. */
export function ScreenshotUpload({ label, variant = "primary", onImage }: ScreenshotUploadProps) {
  const inputId = useId();
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    const result = await prepareImage(file);
    const error = result.ok
      ? await onImage({
          dataUrl: result.dataUrl,
          fileName: file.name,
          width: result.width,
          height: result.height,
        })
      : result.error;
    setBusy(false);
    setError(error);
  };

  return (
    <div className="flex flex-col items-center">
      <label
        htmlFor={inputId}
        aria-disabled={busy || undefined}
        className={`${buttonClass(variant)} cursor-pointer has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <Icon name="upload" className="size-5" />
        {busy ? "Preparing image…" : label}
        <input
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={busy}
          aria-describedby={errorId}
          data-testid="screenshot-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
