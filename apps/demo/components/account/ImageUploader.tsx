"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  imageErrorMessage,
  removeImage,
  uploadImage,
  type ImageTarget,
} from "@/lib/account/account-client";
import type { Framing } from "@/lib/account/image-framing";
import { IMAGE_ACCEPT, type ImageKind } from "@/lib/account/image-rules";
import { prepareImage, readImageSize } from "@/lib/account/prepare-image";
import { duration, usePopVariants } from "@/lib/motion";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";
import { ImageCropDialog, type CropSource } from "./ImageCropDialog";

interface ImageUploaderProps {
  kind: ImageKind;
  target: ImageTarget;
  /** What the image is, for the buttons and notices: "photo", "logo". */
  noun: string;
  /** The current image's URL; null shows `fallback`. */
  src: string | null;
  /** What stands in without an image (a monogram). */
  fallback: ReactNode;
  /** After an upload (its new version) or a removal (null). */
  onChange: (version: string | null) => void;
  hint: string;
  testId: string;
}

type Status = "idle" | "preparing" | "uploading" | "removing" | "uploaded" | "removed";

const BUSY_LABELS: Partial<Record<Status, string>> = {
  preparing: "Preparing…",
  uploading: "Uploading…",
};

interface StoredImageProps {
  src: string;
  fallback: ReactNode;
  /** Its backing: a logo's light one, showing through its transparent parts on dark surfaces. */
  className: string;
}

/**
 * The stored image, filling the tile (cropped, not shrunk: the file stays
 * whole), fading in over a breathing placeholder; `fallback` if it won't load.
 */
function StoredImage({ src, fallback, className }: StoredImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken) return fallback;
  return (
    <>
      {loaded ? null : <Skeleton className="absolute inset-0 size-full rounded-none" />}
      <motion.span
        className={`relative size-full ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: duration.micro }}
      >
        <Image
          src={src}
          alt=""
          width={96}
          height={96}
          unoptimized
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className="block size-full object-cover"
        />
      </motion.span>
    </>
  );
}

/**
 * Pick, preview and remove an avatar or logo. A picked file is checked in the
 * browser (`readImageSize`), then framed square in the crop step
 * (`ImageCropDialog`); Save draws it as framed (`prepareImage`) and uploads
 * it. Each step shows on the button, and a failure says what to do. The tile
 * swaps with a pop (a fade with reduced motion).
 */
export function ImageUploader({
  kind,
  target,
  noun,
  src,
  fallback,
  onChange,
  hint,
  testId,
}: ImageUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const picks = useRef(0);
  const hintId = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropSource | null>(null);
  const variants = usePopVariants();
  const busy = status === "preparing" || status === "uploading" || status === "removing";
  const notice =
    status === "uploaded"
      ? `${capitalized(noun)} saved.`
      : status === "removed"
        ? `${capitalized(noun)} removed.`
        : null;

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared at once, so picking the same file again still counts as a change.
    event.target.value = "";
    if (!file || busy) return;
    setError(null);
    setStatus("preparing");
    const read = await readImageSize(file);
    setStatus("idle");
    if (!read.ok) {
      setError(read.error);
      return;
    }
    // The crop step hands focus back to whatever had it when it opened: the button that picked.
    pickRef.current?.focus();
    picks.current += 1;
    setCrop({ id: picks.current, file, size: read.size });
  };

  const save = async (framing: Framing) => {
    if (!crop) return;
    setCrop(null);
    setStatus("preparing");
    const prepared = await prepareImage(crop.file, kind, framing);
    if (!prepared.ok) {
      setStatus("idle");
      setError(prepared.error);
      return;
    }
    setStatus("uploading");
    const outcome = await uploadImage(target, prepared.blob);
    if (!outcome.ok) {
      setStatus("idle");
      setError(imageErrorMessage(outcome.error, outcome.retryAfterSeconds));
      return;
    }
    setStatus("uploaded");
    onChange(outcome.version);
    router.refresh();
  };

  const remove = async () => {
    if (busy) return;
    setError(null);
    setStatus("removing");
    const outcome = await removeImage(target);
    if (!outcome.ok) {
      setStatus("idle");
      setError(imageErrorMessage(outcome.error, outcome.retryAfterSeconds));
      return;
    }
    setStatus("removed");
    // The Remove button goes with the image: keep focus in the uploader, on the button that's left.
    if (rootRef.current?.contains(document.activeElement)) pickRef.current?.focus();
    onChange(null);
    router.refresh();
  };

  const shape = kind === "avatar" ? "rounded-pill" : "rounded-tile";
  const backing = kind === "logo" ? "bg-logo-bg" : "";
  return (
    <div ref={rootRef} className="flex flex-col" aria-busy={busy} data-testid={testId}>
      <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start">
        <span
          className={`relative grid size-24 shrink-0 place-items-center overflow-hidden bg-card shadow-seg ring-1 ring-line ${shape}`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={src ?? "fallback"}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid size-full place-items-center"
              data-testid={src ? `${testId}-image` : `${testId}-fallback`}
            >
              {src ? <StoredImage src={src} fallback={fallback} className={backing} /> : fallback}
            </motion.span>
          </AnimatePresence>
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              ref={pickRef}
              variant="secondary"
              onClick={() => {
                if (!busy) inputRef.current?.click();
              }}
              aria-disabled={busy || undefined}
              aria-describedby={hintId}
              data-testid={`${testId}-pick`}
            >
              <Icon name="upload" className="size-5" />
              {BUSY_LABELS[status] ?? `${src ? "Replace" : "Upload"} ${noun}`}
            </Button>
            {src ? (
              <Button
                variant="danger-ghost"
                onClick={() => void remove()}
                aria-disabled={busy || undefined}
                data-testid={`${testId}-remove`}
              >
                <Icon name="trash" className="size-5" />
                {status === "removing" ? "Removing…" : `Remove ${noun}`}
              </Button>
            ) : null}
          </div>
          <p id={hintId} className="text-meta text-pretty text-muted">
            {hint}
          </p>
        </div>
      </div>
      {/* Hidden from sight and from Tab: the button above opens it. */}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => void pick(event)}
        data-testid={`${testId}-input`}
      />
      <ImageCropDialog
        kind={kind}
        noun={noun}
        source={crop}
        onCancel={() => setCrop(null)}
        onSave={(framing) => void save(framing)}
      />
      {/* The alerts take room only while they show. */}
      <FormAlert className="has-[p]:mt-4" message={error} testId={`${testId}-error`} />
      <FormAlert className="has-[p]:mt-4" tone="info" message={notice} testId={`${testId}-saved`} />
    </div>
  );
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
