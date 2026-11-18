"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSwapVariants } from "@/lib/motion";
import type { StorageActionError } from "@/lib/admin/storage-client";
import { SettingsCard } from "../account/SettingsCard";
import { FormAlert } from "../auth/FormAlert";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";
import { OrphanTallies, OrphanTalliesSkeleton } from "./OrphanTallies";
import type { OrphanCheck } from "./use-orphan-check";

const COPY = ADMIN_COPY.storage.orphans;

/** Why a check failed, in words: the check's own line, or what's wrong with the session. */
export function orphanCheckError(error: StorageActionError): string {
  return error === "failed" ? COPY.failed : ADMIN_COPY.storage.errors[error];
}

function CheckBody({ state }: { state: OrphanCheck }) {
  switch (state.kind) {
    case "idle":
      return (
        <TileEmpty title={COPY.idleTitle} scene="storage">
          {COPY.idleBody}
        </TileEmpty>
      );
    case "checking":
      return <OrphanTalliesSkeleton />;
    case "ready":
      return <OrphanTallies report={state.report} />;
    case "failed":
      return <FormAlert message={orphanCheckError(state.error)} testId="orphan-error" />;
  }
}

function buttonLabel(state: OrphanCheck): string {
  if (state.kind === "checking") return COPY.checking;
  if (state.kind === "failed") return ADMIN_COPY.unavailable.retry;
  return state.kind === "ready" ? COPY.checkAgain : COPY.check;
}

interface OrphanCheckCardProps {
  state: OrphanCheck;
  onCheck: () => void;
}

/**
 * The Storage page's orphan check: nothing until the admin asks (each check
 * lists Vercel Blob, which is billed), then the rows while it counts, then
 * what the next cleanup would delete, or why it couldn't tell, with the
 * button to check again. Each state slides in for the last.
 */
export function OrphanCheckCard({ state, onCheck }: OrphanCheckCardProps) {
  const swap = useSwapVariants();
  const checking = state.kind === "checking";
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="search"
      testId="orphan-card"
    >
      <div aria-busy={checking || undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.kind === "ready" ? state.report.checkedAt : state.kind}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <CheckBody state={state} />
          </motion.div>
        </AnimatePresence>
      </div>
      <p role="status" className="sr-only">
        {checking ? COPY.checking : ""}
      </p>
      <Button
        variant="secondary"
        onClick={checking ? undefined : onCheck}
        aria-disabled={checking || undefined}
        className="self-start max-sm:self-stretch"
        data-testid="orphan-check"
      >
        <Icon name={state.kind === "idle" ? "search" : "refresh"} className="size-5" />
        {buttonLabel(state)}
      </Button>
    </SettingsCard>
  );
}
