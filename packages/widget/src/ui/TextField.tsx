import { useId, type ChangeEvent, type KeyboardEvent, type Ref } from "react";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  error?: string | null;
  multiline?: boolean;
  /** Visible lines for multiline fields. */
  rows?: number;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  /** Exposed as aria-required; forms here use noValidate and validate inline. */
  required?: boolean;
  inputRef?: Ref<HTMLInputElement & HTMLTextAreaElement>;
}

/** Labelled input or textarea with inline, announced validation. */
export function TextField({
  label,
  value,
  onChange,
  onBlur,
  onKeyDown,
  error,
  multiline = false,
  rows = 4,
  placeholder,
  autoComplete,
  maxLength,
  required = false,
  inputRef,
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const shared = {
    id,
    ref: inputRef,
    className: "pp-input",
    value,
    placeholder,
    maxLength,
    onBlur,
    onKeyDown,
    "aria-required": required ? true : undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  return (
    <div className="pp-field">
      <label className="pp-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={rows} />
      ) : (
        <input {...shared} type="text" autoComplete={autoComplete} />
      )}
      {error ? (
        <p id={errorId} className="pp-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
