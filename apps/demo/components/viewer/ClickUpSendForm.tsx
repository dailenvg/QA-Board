"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, type FormEvent, type KeyboardEvent } from "react";
import type { ClickUpPerson } from "@/lib/integrations/clickup/api";
import type { ClickUpChannel } from "@/lib/integrations/clickup/chat-api";
import { usePopVariants } from "@/lib/motion";
import { projectCardHref, projectHref } from "@/lib/routes";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ClickUpMessagePreview } from "./ClickUpMessagePreview";
import { ClickUpNoteField } from "./ClickUpNoteField";
import { ClickUpPicker } from "./ClickUpPicker";
import { ShareStep } from "./ShareStep";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import { focusLost, type ClickUpOption } from "./clickup-options";
import type { ClickUpDraft } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY;

/** The channel list's radios (enabled ones: a disabled radio can't take focus). */
const RADIO = 'input[type="radio"]:not(:disabled)';

interface ClickUpSendFormProps {
  id: string;
  channels: readonly ClickUpChannel[];
  people: readonly ClickUpPerson[];
  draft: ClickUpDraft;
  onChange: (change: Partial<ClickUpDraft>) => void;
  project: { id: string; name: string };
  sending: boolean;
  /** Why the last send didn't go, or null. */
  error: string | null;
  /** Why the channel can't be sent to (none picked, gone from ClickUp, or closed to them), or null. */
  channelError: string | null;
  /** The channels are being read again, in place. */
  refreshing: boolean;
  /** Counts up each time ClickUp refuses the channel picked: focus goes back to the list. */
  repick: number;
  /** Sends the draft; resolves false when it didn't go. */
  onSend: () => Promise<boolean>;
  /** Reads the lists again (no channels yet: one may have been created in ClickUp since). */
  onReload: () => void;
  /** Phones: the keyboard isn't raised by moving focus to the channel search. */
  phone: boolean;
}

const personOption = ({ id, username, email }: ClickUpPerson): ClickUpOption => ({
  id,
  label: username,
  detail: email,
});

/** Enter in a field of the form (a search, a radio) never submits it. */
function holdEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
}

/**
 * The Send to ClickUp form, in numbered steps on tiles as the Share window
 * is: where it goes (a channel, searchable, required), who reviews it (one
 * person or nobody, searchable), and a note with the message as ClickUp
 * will show it beside the lists on wide screens. Submitted by the window's Send
 * button only: Enter in the lists never sends (a message to a team is
 * costly to send by accident). Focus moves to the channel as the form
 * appears (from the window's Close button, or from the page when the control
 * that had it went with a reload), back to it when no channel is picked or
 * ClickUp refused the one picked (`repick`), and when the channels change
 * under a control that had focus: its search field, or on phones its picked
 * (else first) radio, so the keyboard doesn't come up. Why a send failed
 * scrolls into view above the footer.
 */
export function ClickUpSendForm({
  id,
  channels,
  people,
  draft,
  onChange,
  project,
  sending,
  error,
  channelError,
  refreshing,
  repick,
  onSend,
  onReload,
  phone,
}: ClickUpSendFormProps) {
  const variants = usePopVariants();
  const reduce = useReducedMotion();
  const channelSearch = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  /** The last `repick` acted on: only a new one moves focus. */
  const repicked = useRef(repick);
  const channelOptions = useMemo(
    () => channels.map(({ id: channelId, name }) => ({ id: channelId, label: name })),
    [channels],
  );
  const peopleOptions = useMemo(() => people.map(personOption), [people]);
  const assignee = people.find((person) => person.id === draft.assignee) ?? null;

  /** The channel choice: its search field, or on a phone a radio (no keyboard). */
  const focusChannel = () => {
    const search = channelSearch.current;
    if (!phone || !search) {
      search?.focus();
      return;
    }
    const group = search.closest('[role="group"]');
    const radios = Array.from(group?.querySelectorAll<HTMLInputElement>(RADIO) ?? []);
    (radios.find((radio) => radio.checked) ?? radios[0] ?? search).focus();
  };

  useEffect(() => {
    // Opened while loading, focus is on the window's Close button: from there to the first field
    // (not on phones, where Close keeps it). Lost to the page, it comes back here on any screen.
    const lost = focusLost();
    if (lost || (!phone && document.activeElement?.closest('[role="dialog"]'))) focusChannel();
    // Only as the form appears: later focus is the member's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (repick === repicked.current) return;
    repicked.current = repick;
    focusChannel();
    // Only as ClickUp refuses a channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repick]);

  useEffect(() => {
    // The channels changed under the control that had focus (Try again in an empty list): back here.
    if (focusLost()) focusChannel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  }, [error, reduce]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.channelId) focusChannel();
    await onSend();
  };

  return (
    <form
      id={id}
      onSubmit={(event) => void submit(event)}
      onKeyDown={holdEnter}
      noValidate
      aria-busy={sending}
      className="grid gap-4 lg:grid-cols-2 lg:items-start"
      data-testid="clickup-send-form"
    >
      {/* Held while a send is on its way, so a change can't look like it went with it. */}
      <fieldset disabled={sending} className="flex min-w-0 flex-col gap-4">
        <ShareStep step={1} title={COPY.steps.channel} testId="clickup-step-channel">
          <ClickUpPicker
            label={COPY.channel.label}
            searchPlaceholder={COPY.channel.search}
            options={channelOptions}
            value={draft.channelId}
            onChange={(channelId) => onChange({ channelId })}
            prefix="#"
            required
            empty={COPY.channel.empty}
            emptyAction={
              <Button variant="secondary" size="sm" onClick={onReload}>
                <Icon name="refresh" className="size-4" />
                {COPY.retry}
              </Button>
            }
            noMatch={COPY.channel.noMatch}
            error={channelError}
            busy={refreshing}
            searchRef={channelSearch}
            testId="clickup-channel"
          />
        </ShareStep>
        <ShareStep step={2} title={COPY.steps.assignee} testId="clickup-step-assignee">
          <ClickUpPicker
            label={COPY.assignee.label}
            searchPlaceholder={COPY.assignee.search}
            options={peopleOptions}
            value={draft.assignee}
            onChange={(person) => onChange({ assignee: person })}
            noneLabel={COPY.assignee.nobody}
            aside={COPY.optional}
            hint={COPY.people.notified}
            empty={COPY.people.empty}
            noMatch={COPY.assignee.noMatch}
            testId="clickup-assignee"
          />
        </ShareStep>
      </fieldset>
      {/*
        Two columns: the note and its preview stay in view (top-6, the window's own padding) as
        the lists scroll by on a short screen, so picking who reviews it shows in the preview.
      */}
      <div className="min-w-0 lg:sticky lg:top-6">
        <ShareStep step={3} title={COPY.steps.note} testId="clickup-step-note">
          <ClickUpNoteField
            value={draft.note}
            onChange={(note) => onChange({ note })}
            readOnly={sending}
          />
          <ClickUpMessagePreview
            projectName={project.name}
            projectUrl={new URL(projectHref(project.id), window.location.origin).href}
            cardSrc={projectCardHref(project.id)}
            note={draft.note}
            assignee={assignee?.username ?? null}
          />
        </ShareStep>
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="error"
            ref={errorRef}
            role="alert"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-start gap-2 rounded-tile bg-danger-soft p-3 text-meta text-danger lg:col-span-2"
            data-testid="clickup-send-error"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 wrap-anywhere">{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </form>
  );
}
