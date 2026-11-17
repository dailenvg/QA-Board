import { DefaultAvatar } from "./DefaultAvatar";

interface PersonMarkProps {
  /** The Squint admin: a person and shield on a dark bubble. */
  admin?: boolean;
  /** The slot's side in CSS px. */
  size: number;
  testId?: string;
}

/**
 * Someone's default mark without a photo: head and shoulders on a light gray
 * bubble, for anyone on the team or a client. The admin has their own.
 */
export function PersonMark({ admin = false, size, testId }: PersonMarkProps) {
  return <DefaultAvatar kind={admin ? "admin" : "person"} size={size} testId={testId} />;
}
