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

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-body text-pretty text-muted">{children}</p>;
}

/**
 * The ClickUp card's body: can't connect from this site, not connected (the
 * token form), or connected. States swap with a pop (a fade with reduced
 * motion); how the last step went shows above them.
 */
export function ClickUpIntegration({ section }: { section: ClickUpSection }) {
  const [notice, setNotice] = useState<ClickUpNotice | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const variants = usePopVariants();

  const body = (() => {
    switch (section.kind) {
      case "unavailable":
        return <Muted>{COPY.unavailable}</Muted>;
      case "disconnected":
        return (
          <div className="flex flex-col gap-4">
            <Muted>{COPY.disconnected}</Muted>
            <ClickUpTokenForm onNotice={setNotice} onConnected={() => root.current?.focus()} />
          </div>
        );
      case "connected":
        return (
          <ClickUpConnected
            connection={section.connection}
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
      className="flex flex-col rounded-tile outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4 focus-visible:ring-offset-card"
      data-testid="clickup-integration"
      data-state={section.kind}
    >
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
