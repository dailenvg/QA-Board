import { companyFill, type AvatarFit } from "@/lib/avatar/default-avatar";
import { DefaultAvatar } from "./DefaultAvatar";

interface CompanyMarkProps {
  /** Its brand color; null: magenta. */
  color: string | null;
  /** The slot's side in CSS px. */
  size: number;
  fit?: AvatarFit;
  testId?: string;
}

/** A company's default mark without a logo: a building on a bubble in its brand color. */
export function CompanyMark({ color, size, fit, testId }: CompanyMarkProps) {
  return (
    <DefaultAvatar kind="company" fill={companyFill(color)} size={size} fit={fit} testId={testId} />
  );
}
