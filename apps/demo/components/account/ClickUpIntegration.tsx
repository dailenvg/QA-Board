"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import type { ClickUpSection } from "@/lib/integrations/clickup/section";
import { usePopVariants } from "@/lib/motion";
import { FormAlert } from "../auth/FormAlert";
import { ClickUpConnected } from "./ClickUpConnected";
import { ClickUpTokenForm } from "./ClickUpTokenForm";
import { INTEGRATIONS_COPY, type ClickUpNotice } from "./integrations-copy";

const COPY = INTEGRATIONS_COPY.clickUp;

interface ClickUpIntegrationProps {
  section: ClickUpSection;
  /** Only the owner connects or disconnects. */
  isOwner: boolean;
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-body text-pretty text-muted">{children}</p>;
}

/**
 * ClickUp's row in the Integrations card: can't connect from this site, not
 * connected (the token form, for the owner), or connected. States swap with
 * a pop (a fade with reduced motion); how the last step went shows above them.
 */
export function ClickUpIntegration({ section, isOwner }: ClickUpIntegrationProps) {
  const [notice, setNotice] = useState<ClickUpNotice | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const variants = usePopVariants();

  const body = (() => {
    switch (section.kind) {
      case "unavailable":
        return <Muted>{COPY.unavailable}</Muted>;
      case "disconnected":
        return isOwner ? (
          <div className="flex flex-col gap-4">
            <Muted>{COPY.disconnected}</Muted>
            <ClickUpTokenForm onNotice={setNotice} onConnected={() => root.current?.focus()} />
          </div>
        ) : (
          <Muted>{COPY.memberOnly}</Muted>
        );
      case "connected":
        return (
          <ClickUpConnected
            connection={section.connection}
            isOwner={isOwner}
            onNotice={setNotice}
            onDisconnected={() => root.current?.focus()}
          />
        );
    }
  })();

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="flex flex-col rounded-tile bg-panel p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus"
      data-testid="clickup-integration"
      data-state={section.kind}
    >
      <h3 className="mb-4 text-heading font-semibold">{COPY.name}</h3>
      {/*
       * The live regions stay mounted so changes are announced, but take room (their space
       * below) only while a message shows: a flex gap would count them even when empty.
       */}
      <FormAlert
        message={notice?.tone === "error" ? notice.message : null}
        testId="clickup-error"
        className="has-[p]:mb-4"
      />
      <FormAlert
        tone="info"
        message={notice?.tone === "info" ? notice.message : null}
        testId="clickup-notice"
        className="has-[p]:mb-4"
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={section.kind}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
