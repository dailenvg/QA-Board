import type { ReactNode } from "react";

interface ImportActionsProps {
  /** The main actions, least important first: stacked on phones with the last on top. */
  children: ReactNode;
  /** A quieter action set apart at the start of the row (Discard). */
  aside?: ReactNode;
}

/** The import dialog's button row, laid out like `ConfirmDialog`'s. */
export function ImportActions({ children, aside }: ImportActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      {aside ? <div className="flex sm:mr-auto [&>*]:w-full sm:[&>*]:w-auto">{aside}</div> : null}
      {children}
    </div>
  );
}
