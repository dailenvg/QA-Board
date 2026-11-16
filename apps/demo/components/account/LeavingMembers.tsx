"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { LeavingMember } from "@/lib/workspace/members/members-data";
import { PersonAvatar } from "../ui/PersonAvatar";
import { MEMBERS_COPY } from "./members-copy";
import { useDeleteDate } from "./use-delete-date";

const COPY = MEMBERS_COPY.leaving;
const GROUP = staggerGroup();

/**
 * Members who deleted their own account and are in their 30 days (I7, 4b.2):
 * listed after everyone else, never counted, no menu. Plain list content, no
 * live region: it changes with a page load, not with something just done here.
 */
export function LeavingMembers({ leaving }: { leaving: readonly LeavingMember[] }) {
  const headingId = useId();
  if (leaving.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2" data-testid="leaving">
      <div className="flex flex-col gap-1 px-3">
        <h3 id={headingId} className="text-meta font-semibold text-muted">
          {COPY.title}
        </h3>
        <p className="text-meta text-muted">{COPY.description}</p>
      </div>
      <motion.ul
        variants={GROUP}
        initial="hidden"
        animate="visible"
        aria-labelledby={headingId}
        className="flex flex-col gap-1"
      >
        {leaving.map((person) => (
          <LeavingRow key={person.id} person={person} />
        ))}
      </motion.ul>
    </section>
  );
}

function LeavingRow({ person }: { person: LeavingMember }) {
  const variants = useRevealVariants();
  const date = useDeleteDate(person.until);
  const name = person.name?.trim() || person.email;
  return (
    <motion.li
      variants={variants}
      className="flex min-h-11 items-center gap-3 rounded-row px-3 py-2"
      data-testid="leaving-row"
    >
      <PersonAvatar
        name={person.name?.trim() || null}
        fallback={person.email}
        src={null}
        size="md"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-nav font-semibold text-ink" title={name}>
            {name}
          </span>
          <span className="shrink-0 rounded-pill bg-seg px-2 py-0.5 text-label font-semibold text-ink-2">
            {COPY.chip}
          </span>
        </div>
        <span className="text-meta text-muted wrap-anywhere">
          {`${person.email} · `}
          <time dateTime={new Date(person.until).toISOString()} title={date}>
            {COPY.until(date)}
          </time>
        </span>
      </div>
    </motion.li>
  );
}
