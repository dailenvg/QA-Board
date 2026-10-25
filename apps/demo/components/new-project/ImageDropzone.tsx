"use client";

import Image from "next/image";
import { useId, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE } from "@/lib/image";
import type { ImageUpload } from "@/lib/store/actions";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";

interface ImageDropzoneProps {
  image: ImageUpload | null;
  processing: boolean;
  error: string | null;
  onFile: (file: File) => void;
}

/** Drop target and file picker for PNG, JPG, WebP and GIF images, with a preview. */
export function ImageDropzone({ image, processing, error, onFile }: ImageDropzoneProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div>
      <span className="mb-2 block text-body font-semibold" id={`${inputId}-label`}>
        Image
      </span>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="image-dropzone"
        className={`relative flex min-h-40 flex-col items-center justify-center gap-2 overflow-hidden rounded-tile border-2 border-dashed p-5 text-center transition-colors has-[input:focus-visible]:border-focus has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${
          processing ? "cursor-progress" : "cursor-pointer"
        } ${
          dragging
            ? "border-brand bg-brand-soft"
            : error
              ? "border-danger bg-card hover:bg-hover"
              : "border-field-line bg-card hover:bg-hover active:bg-seg"
        }`}
      >
        {image ? (
          <>
            <span className="relative block h-28 w-full">
              <Image src={image.dataUrl} alt="" fill unoptimized className="object-contain" />
            </span>
            <span className="max-w-full truncate text-meta font-medium text-ink-2">
              {image.fileName}
            </span>
            <span className="text-meta font-semibold text-brand-text">
              Choose a different image
            </span>
          </>
        ) : (
          <>
            <Icon name="upload" className="size-6 text-muted" />
            <span className="text-body font-semibold">
              {processing ? "Preparing image…" : "Drop an image here, or choose a file"}
            </span>
            <span id={hintId} className="text-meta text-muted">
              PNG, JPG, WebP or GIF, up to 15 MB
            </span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          aria-labelledby={`${inputId}-label`}
          aria-describedby={`${hintId} ${errorId}`}
          aria-invalid={error ? true : undefined}
          disabled={processing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
