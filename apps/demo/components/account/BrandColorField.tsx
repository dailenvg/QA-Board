"use client";

import { useId, type Ref } from "react";
import { normalizeBrandColor } from "@/lib/account/field-rules";
import { brandColorContrast, COBALT, MIN_BRAND_CONTRAST } from "@/lib/brand-palette";
import { Button } from "../ui/Button";
import { FIELD_CLASS } from "../ui/field-styles";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";

interface BrandColorFieldProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

/** What the color picker shows while the field is blank: Squint's own blue. */
const DEFAULT_PICKER = COBALT.toLowerCase();

/** One surface's ratio, passing or not. Text and icon both say which, not color alone. */
function ContrastChip({ label, ratio, passes }: { label: string; ratio: number; passes: boolean }) {
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-label font-semibold ${passes ? "bg-resolved-soft text-resolved-text" : "bg-danger-soft text-danger"}`}
    >
      <Icon name={passes ? "check" : "alert"} className="size-3.5" />
      On {label.toLowerCase()}: {ratio.toFixed(1)}:1
      <span className="sr-only">{passes ? ", enough" : ", not enough"}</span>
    </li>
  );
}

/**
 * The workspace's brand color: a picker and the hex it sets (either one can
 * be used), with how it stands out on the light surfaces it's drawn on, as
 * the color changes. Blank keeps Squint's own blue.
 */
export function BrandColorField({
  value,
  error,
  onChange,
  onBlur,
  inputRef,
}: BrandColorFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const color = normalizeBrandColor(value);
  const surfaces = color ? brandColorContrast(color) : [];
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
        Brand color
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {/* The swatch is the picker: a native color input, sized as a touch target. */}
        <span className="relative size-11 shrink-0 overflow-hidden rounded-field shadow-seg ring-1 ring-field-line ring-inset focus-within:ring-2 focus-within:ring-focus">
          <input
            type="color"
            aria-label="Pick a brand color"
            value={color ?? DEFAULT_PICKER}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            className="absolute -inset-2 size-[calc(100%+1rem)] cursor-pointer border-0 bg-transparent p-0"
            data-testid="brand-color-picker"
          />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          name="brandColor"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={7}
          placeholder={DEFAULT_PICKER}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${hintId} ${errorId}`}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          data-testid="brand-color"
          className={`${FIELD_CLASS} max-w-36 font-mono`}
        />
        {value ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            data-testid="brand-color-clear"
          >
            Use Squint&apos;s blue
          </Button>
        ) : null}
      </div>
      <p id={hintId} className="mt-2 text-meta text-muted">
        A hex color for the accents on your review links. It needs {MIN_BRAND_CONTRAST}:1 contrast
        on white and on the page&apos;s panels. Leave it blank for Squint&apos;s blue.
      </p>
      {surfaces.length > 0 ? (
        <ul
          aria-label="Contrast"
          className="mt-2 flex flex-wrap gap-2"
          data-testid="brand-contrast"
        >
          {surfaces.map((surface) => (
            <ContrastChip key={surface.id} {...surface} />
          ))}
        </ul>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
