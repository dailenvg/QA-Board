"use client";

import { useId, useState } from "react";
import {
  startFraming,
  zoomRange,
  zoomTo,
  type Framing,
  type SourceSize,
} from "@/lib/account/image-framing";
import type { ImageKind } from "@/lib/account/image-rules";
import { useObjectUrl } from "@/lib/use-object-url";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ImageCropFrame } from "./ImageCropFrame";
import { ImageCropZoom } from "./ImageCropZoom";

/** A picked file that passed the checks, with its upright size. `id` tells one pick from the next. */
export interface CropSource {
  id: number;
  file: File;
  size: SourceSize;
}

interface ImageCropDialogProps {
  kind: ImageKind;
  /** What the image is, for the title: "photo", "logo". */
  noun: string;
  /** Open while there's a file to crop. */
  source: CropSource | null;
  onCancel: () => void;
  onSave: (framing: Framing) => void;
}

/**
 * The step between picking an avatar or logo and uploading it: size it with
 * the slider and move it in the frame, then Save; Cancel (or Escape) uploads
 * nothing and puts focus back on the button that picked it.
 */
export function ImageCropDialog({ kind, noun, source, onCancel, onSave }: ImageCropDialogProps) {
  return (
    <Dialog open={source !== null} onClose={onCancel} title={`Adjust ${noun}`} testId="image-crop">
      {source ? (
        <CropEditor
          key={source.id}
          kind={kind}
          source={source}
          onCancel={onCancel}
          onSave={onSave}
        />
      ) : null}
    </Dialog>
  );
}

interface CropEditorProps {
  kind: ImageKind;
  source: CropSource;
  onCancel: () => void;
  onSave: (framing: Framing) => void;
}

function CropEditor({ kind, source, onCancel, onSave }: CropEditorProps) {
  const hintId = useId();
  const url = useObjectUrl(source.file);
  const range = zoomRange(kind, source.size);
  const start = startFraming(range);
  const [framing, setFraming] = useState(start);
  // Set by Reset, so the image springs back; any other change tracks the hand exactly.
  const [settling, setSettling] = useState(false);
  const atStart = framing.scale === start.scale && framing.x === 0 && framing.y === 0;

  const change = (next: (current: Framing) => Framing) => {
    setSettling(false);
    setFraming(next);
  };
  const reset = () => {
    setSettling(true);
    setFraming(start);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <ImageCropFrame
          kind={kind}
          src={url}
          size={source.size}
          range={range}
          framing={framing}
          settling={settling}
          onChange={change}
          describedBy={hintId}
        />
        <p id={hintId} className="text-center text-meta text-pretty text-muted">
          Drag the image to move it, or focus the frame and use the arrow keys.
        </p>
      </div>
      <ImageCropZoom
        kind={kind}
        range={range}
        scale={framing.scale}
        onZoom={(scale) => change((current) => zoomTo(source.size, range, current, scale))}
        onReset={reset}
        canReset={!atStart}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} data-testid="image-crop-cancel">
          Cancel
        </Button>
        <Button onClick={() => onSave(framing)} data-testid="image-crop-save">
          Save
        </Button>
      </div>
    </div>
  );
}
