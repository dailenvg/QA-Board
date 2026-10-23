import { useId } from "react";
import { PRIORITIES, type Priority } from "../core/types";

interface PriorityFieldProps {
  value: Priority | null;
  onChange: (value: Priority | null) => void;
}

const OPTIONS: ReadonlyArray<{ value: Priority | null; label: string }> = [
  { value: null, label: "None" },
  ...PRIORITIES.map((priority) => ({
    value: priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
  })),
];

/** Segmented radio group for the optional priority. Native radios keep arrow-key support. */
export function PriorityField({ value, onChange }: PriorityFieldProps) {
  const name = useId();
  return (
    <fieldset className="pp-field">
      <legend className="pp-label">
        Priority <span className="pp-label__hint">(optional)</span>
      </legend>
      <div className="pp-choices">
        {OPTIONS.map((option) => (
          <label key={option.label} className="pp-choice">
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
