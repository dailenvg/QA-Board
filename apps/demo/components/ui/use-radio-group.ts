import { useRef, type KeyboardEvent } from "react";

interface RadioOption<T extends string> {
  value: T;
  disabled?: boolean;
}

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Keyboard model for a group of `role="radio"` buttons: one Tab stop (the
 * selected option, or the first available one); arrow keys, Home and End move
 * focus and select, skipping disabled options. Attach `ref(index)` and
 * `onKeyDown(event, index)` to each button.
 */
export function useRadioGroup<T extends string>(
  options: ReadonlyArray<RadioOption<T>>,
  value: T,
  onChange: (value: T) => void,
) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabStop =
    selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : (enabled[0] ?? -1);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (enabled.length === 0) return;
    const position = enabled.indexOf(index);
    let next: number | undefined;
    if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    else if (event.key in STEPS) {
      const from = position >= 0 ? position : 0;
      next = enabled[(from + (STEPS[event.key] ?? 0) + enabled.length) % enabled.length];
    }
    if (next === undefined) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    buttons.current[next]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const ref = (index: number) => (node: HTMLButtonElement | null) => {
    buttons.current[index] = node;
  };

  return { tabStop, ref, onKeyDown };
}
