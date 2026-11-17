import { ADMIN_HREF } from "@/lib/routes";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";

/** The admin's way back to the panel from outside it (their account settings). */
export function BackToAdmin() {
  return (
    <ButtonLink
      href={ADMIN_HREF}
      variant="ghost"
      size="sm"
      className="self-start"
      testId="back-to-admin"
    >
      <Icon name="chevronLeft" className="size-5" />
      {ADMIN_COPY.backToAdmin}
    </ButtonLink>
  );
}
