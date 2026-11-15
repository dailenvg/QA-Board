import { useId } from "react";
import { MEMBER_SWITCHES, type MemberSwitch } from "@/lib/auth/permissions";
import { Icon } from "../ui/Icon";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.own;

interface OwnPermissionsProps {
  /** The member's own switches that are on. */
  permissions: readonly MemberSwitch[];
  /** Who to ask: the owner's name, or "the workspace's owner". */
  owner: string;
}

/**
 * A member's own switches, read-only (D5, 4b.3): one "You can" or "You can't"
 * line each, so a control hidden elsewhere is explained in one place. Plain
 * text with an icon, never switches that look pressable.
 */
export function OwnPermissions({ permissions, owner }: OwnPermissionsProps) {
  const titleId = useId();
  const anyOff = MEMBER_SWITCHES.some((value) => !permissions.includes(value));
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-tile bg-tile px-4 py-3"
      data-testid="own-permissions"
    >
      <h4 id={titleId} className="text-body font-semibold">
        {COPY.title}
      </h4>
      <ul className="flex flex-col gap-2">
        {MEMBER_SWITCHES.map((value) => {
          const on = permissions.includes(value);
          return (
            <li
              key={value}
              className={`flex items-start gap-2 text-meta ${on ? "text-ink" : "text-ink-2"}`}
              data-testid="own-permission"
              data-on={on}
            >
              <Icon
                name={on ? "check" : "minus"}
                className={`mt-0.5 size-4 shrink-0 ${on ? "text-resolved-text" : "text-muted"}`}
              />
              {COPY.line(value, on)}
            </li>
          );
        })}
      </ul>
      {anyOff ? <p className="text-meta text-muted">{COPY.ask(owner)}</p> : null}
    </section>
  );
}
