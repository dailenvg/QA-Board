import { Icon } from "./Icon";

interface FieldErrorProps {
  id: string;
  message: string | null;
}

/** Inline error under a field. Always rendered so `aria-describedby` stays valid. */
export function FieldError({ id, message }: FieldErrorProps) {
  return (
    <p id={id} role={message ? "alert" : undefined} className="text-meta text-danger empty:hidden">
      {message ? (
        <span className="mt-2 flex items-start gap-2">
          <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
          {message}
        </span>
      ) : null}
    </p>
  );
}
