"use client";

import type { ReactNode } from "react";
import { loginHref } from "@/lib/auth/next-path";
import { ownerLabel } from "@/lib/workspace-client/permission-copy";
import type { JoinBrand, JoinPageState } from "@/lib/workspace/members/join-page";
import type { Mood } from "../brand/mascot/moods";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { AuthPanel } from "./AuthPanel";
import { JOIN_COPY } from "./join-copy";
import { TextLink } from "./TextLink";

/** The states that are only words and a way on: not the form, not the Join button. */
export type JoinInfoState = Exclude<JoinPageState, { kind: "member" | "new-person" | "join" }>;

interface JoinStatePanelProps {
  state: JoinInfoState;
  token: string;
  signedIn: boolean;
  focusTitle: boolean;
  /** "Back to sign in", or "Go to Squint" when signed in. */
  footer: ReactNode;
}

interface Panel {
  title: string;
  line: string;
  mood: Mood;
  brand: JoinBrand | null;
  action?: ReactNode;
  /** Replaces the usual footer link (a second way on, or none). */
  footer?: ReactNode;
}

const panelBrand = (brand: JoinBrand) => ({
  name: brand.workspace,
  color: brand.color,
  logoSrc: brand.logoSrc,
});

/** Signs out, then back to this invite's page to continue as the invited address. */
function SignOutAndContinue({ token }: { token: string }) {
  return (
    <form action="/api/auth/logout" method="post" className="flex flex-col">
      <input type="hidden" name="next" value={`/join/${token}`} />
      <Button type="submit" data-testid="join-sign-out">
        {JOIN_COPY.someoneElse.signOut}
      </Button>
    </form>
  );
}

function panelOf(state: JoinInfoState, token: string, signedIn: boolean): Panel {
  const signInOrApp = signedIn ? (
    <ButtonLink href="/">{JOIN_COPY.app}</ButtonLink>
  ) : (
    <ButtonLink href="/login" testId="join-sign-in">
      {JOIN_COPY.signInButton}
    </ButtonLink>
  );
  switch (state.kind) {
    case "unknown":
      return {
        title: JOIN_COPY.unknown.title,
        line: JOIN_COPY.unknown.line,
        mood: "thinking",
        brand: null,
        action: signedIn ? (
          <ButtonLink href="/">{JOIN_COPY.app}</ButtonLink>
        ) : (
          <ButtonLink href="/login">{JOIN_COPY.unknown.button}</ButtonLink>
        ),
        footer: null,
      };
    case "unavailable":
      return {
        title: JOIN_COPY.unavailable.title,
        line: JOIN_COPY.unavailable.line,
        mood: "thinking",
        brand: null,
        action: (
          <Button onClick={() => window.location.reload()}>{JOIN_COPY.unavailable.button}</Button>
        ),
      };
    case "expired":
    case "cancelled": {
      const copy = JOIN_COPY[state.kind];
      return {
        title: copy.title,
        line: copy.line(ownerLabel(state.brand.owner), state.brand.workspace),
        mood: "thinking",
        brand: state.brand,
      };
    }
    case "used":
      return {
        title: JOIN_COPY.used.title,
        line: JOIN_COPY.used.line(ownerLabel(state.brand.owner), state.brand.workspace),
        mood: "idle",
        brand: state.brand,
        action: signInOrApp,
        footer: null,
      };
    case "full":
      return {
        title: JOIN_COPY.full.title(state.brand.workspace),
        line: JOIN_COPY.full.line(ownerLabel(state.brand.owner)),
        mood: "thinking",
        brand: state.brand,
      };
    case "someone-else":
      return {
        title: JOIN_COPY.someoneElse.title,
        line: JOIN_COPY.someoneElse.line(state.signedInAs, state.email),
        mood: "thinking",
        brand: state.brand,
        action: (
          <div className="flex flex-col gap-3">
            <SignOutAndContinue token={token} />
            <ButtonLink href="/" variant="secondary" testId="join-stay">
              {JOIN_COPY.someoneElse.stay}
            </ButtonLink>
          </div>
        ),
        footer: null,
      };
    case "in-another":
      return {
        title: JOIN_COPY.inAnother.title(state.other),
        line: JOIN_COPY.inAnother.line,
        mood: "thinking",
        brand: state.brand,
        action: <ButtonLink href="/">{JOIN_COPY.inAnother.button(state.other)}</ButtonLink>,
        footer: null,
      };
    case "account-closing":
      return {
        title: JOIN_COPY.closing.title,
        line: JOIN_COPY.closing.line(state.email, ownerLabel(state.brand.owner)),
        mood: "thinking",
        brand: state.brand,
      };
    case "sign-in":
      return {
        title: JOIN_COPY.signIn.title(state.brand.workspace),
        line: JOIN_COPY.signIn.line(state.email),
        mood: "idle",
        brand: state.brand,
        action: (
          <ButtonLink href={loginHref(`/join/${token}`)} testId="join-sign-in">
            {JOIN_COPY.signIn.button}
          </ButtonLink>
        ),
        footer: <TextLink href="/reset">{JOIN_COPY.signIn.forgot}</TextLink>,
      };
  }
}

/**
 * Every state of an invite's page that isn't the form or the Join button
 * (4b.6): a title, one sentence, at most one main action, and a footer link.
 * The unknown and unavailable states carry no brand: a closing workspace's
 * name never shows.
 */
export function JoinStatePanel({
  state,
  token,
  signedIn,
  focusTitle,
  footer,
}: JoinStatePanelProps) {
  const panel = panelOf(state, token, signedIn);
  return (
    <AuthPanel
      title={panel.title}
      description={panel.line}
      mood={panel.mood}
      brand={panel.brand && panelBrand(panel.brand)}
      focusTitle={focusTitle}
      footer={panel.footer === undefined ? footer : panel.footer}
    >
      {panel.action ? (
        <div className="flex flex-col" data-testid="join-state-action">
          {panel.action}
        </div>
      ) : null}
    </AuthPanel>
  );
}
