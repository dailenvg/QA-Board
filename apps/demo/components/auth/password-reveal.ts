import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type Report = (field: string, revealed: boolean) => void;

/** How a password field tells the panel around it whether it shows its password. */
export const PasswordRevealContext = createContext<Report>(() => undefined);

/** `fields` with `field` added (revealed) or removed; the same set when nothing changes. */
export function withReveal(
  fields: ReadonlySet<string>,
  field: string,
  revealed: boolean,
): ReadonlySet<string> {
  if (fields.has(field) === revealed) return fields;
  const next = new Set(fields);
  if (revealed) next.add(field);
  else next.delete(field);
  return next;
}

/**
 * For a password field: its Show/Hide state, reported to the panel around it
 * (if any). A field that unmounts counts as hidden.
 */
export function useReportedReveal(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const report = useContext(PasswordRevealContext);
  const field = useId();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    report(field, revealed);
    return () => report(field, false);
  }, [report, field, revealed]);
  return [revealed, setRevealed];
}

/** For the panel: whether any field inside shows its password, and the reporter to provide. */
export function useRevealedPasswords(): { anyRevealed: boolean; report: Report } {
  const [fields, setFields] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback<Report>(
    (field, revealed) => setFields((current) => withReveal(current, field, revealed)),
    [],
  );
  return { anyRevealed: fields.size > 0, report };
}
