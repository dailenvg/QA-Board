"use client";

import { useId, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE } from "@/lib/image";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";

interface ImageDropzoneProps {
  /** Some images are already chosen: the prompt offers to add more. */
  hasImages: boolean;
  error: string | null;
  onFiles: (files: File[]) => void;
}

/** Drop target and file picker for one or more PNG, JPG, WebP and GIF images. */
export function ImageDropzone({ hasImages, error, onFiles }: ImageDropzoneProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  };

  return (
    <div>
      <span className="mb-2 block text-body font-semibold" id={`${inputId}-label`}>
        Images
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
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-tile border-2 border-dashed p-5 text-center transition-colors has-[input:focus-visible]:border-focus has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${
          hasImages ? "min-h-24" : "min-h-40"
        } ${
          dragging
            ? "border-brand bg-brand-soft"
            : error
              ? "border-danger bg-card hover:bg-hover"
              : "border-field-line bg-card hover:bg-hover active:bg-seg"
        }`}
      >
        <Icon name="upload" className="size-6 text-muted" />
        <span className="text-body font-semibold">
          {hasImages ? "Add more images" : "Drop images here, or choose files"}
        </span>
        <span id={hintId} className="text-meta text-muted">
          PNG, JPG, WebP or GIF, up to 15 MB each. Choose several to combine them into pages.
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          aria-labelledby={`${inputId}-label`}
          aria-describedby={`${hintId} ${errorId}`}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length) onFiles(files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
