import { ADMIN_FILL, personFill } from "@/lib/avatar/default-avatar";
import { monogramInitials } from "@/lib/monogram";
import { DefaultAvatar } from "./DefaultAvatar";

interface PersonMarkProps {
  /** Their name, else their email: the pin color and the initials come from it. */
  label: string;
  /** The Squint admin: a person and shield on Pumpkin, no initials. */
  admin?: boolean;
  /**
   * A company badge hangs off the mark's lower left, where initials would run
   * under it: head and shoulders instead, no initials.
   */
  badged?: boolean;
  /** The slot's side in CSS px. */
  size: number;
  testId?: string;
}

/**
 * Someone's default mark without a photo, in their pin color: their initials
 * under a small head, or head and shoulders beside a company badge. The
 * admin has their own.
 */
export function PersonMark({
  label,
  admin = false,
  badged = false,
  size,
  testId,
}: PersonMarkProps) {
  if (admin) return <DefaultAvatar kind="admin" fill={ADMIN_FILL} size={size} testId={testId} />;
  return (
    <DefaultAvatar
      kind="person"
      fill={personFill(label)}
      size={size}
      silhouette={badged}
      initials={badged ? undefined : monogramInitials(label)}
      testId={testId}
    />
  );
}
