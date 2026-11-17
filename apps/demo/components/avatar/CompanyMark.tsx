import type { AvatarFit } from "@/lib/avatar/default-avatar";
import { DefaultAvatar } from "./DefaultAvatar";

interface CompanyMarkProps {
  /** The slot's side in CSS px. */
  size: number;
  fit?: AvatarFit;
  testId?: string;
}

/** A company's default mark without a logo: a building on a gray bubble. */
export function CompanyMark({ size, fit, testId }: CompanyMarkProps) {
  return <DefaultAvatar kind="company" size={size} fit={fit} testId={testId} />;
}
