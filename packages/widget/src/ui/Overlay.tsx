import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeAnchor, resolveAnchor } from "../core/anchor";
import type { PinpointClient } from "../core/client";
import { cleanPageUrl, readPinParam } from "../core/deeplink";
import { deepActiveElement, describeElement } from "../core/dom";
import { viewportSize, type Point } from "../core/geometry";
import { captureViewport } from "../core/screenshot";
import { resolveSelector } from "../core/selector";
import type { Pin, PinAnchor } from "../core/types";
import { Composer, type ComposerValues } from "./Composer";
import { HoverOutline } from "./HoverOutline";
import { PinBadge } from "./PinBadge";
import { Thread } from "./Thread";
import { Toolbar } from "./Toolbar";
import type { ReplyValues } from "./ReplyForm";
import { useClosable } from "./hooks/use-closable";
import { useCommentMode } from "./hooks/use-comment-mode";
import { useCurrentPath } from "./hooks/use-current-path";
import { useLatest } from "./hooks/use-latest";
import { useLayoutVersion } from "./hooks/use-layout-version";
import { usePins } from "./hooks/use-pins";
import { useReducedMotion } from "./hooks/use-reduced-motion";
import { reviewTokenStore } from "./hooks/use-review-token";
import { useReviewerName } from "./hooks/use-reviewer-name";
import { badgeRect } from "./pin-geometry";
import { EXIT_DURATION_MS } from "./styles";

interface OverlayProps {
  host: HTMLElement;
  client: PinpointClient;
  token: string;
  branch: string | null;
  path?: string;
}

/** U+00A0, appended to repeat an identical live-region message. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

type OpenPopover =
  | { kind: "composer"; anchor: PinAnchor; number: number; key: number }
  | { kind: "thread"; pinId: string };

function byCreatedAt(a: Pin, b: Pin): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function pinLabel(pin: Pin, number: number, detached: boolean): string {
  const state = [pin.resolved ? "resolved" : "", detached ? "element changed" : ""].filter(Boolean);
  return `Comment ${number} by ${pin.author}${state.length ? `, ${state.join(", ")}` : ""}`;
}

/** Everything rendered inside the shadow root once a review token is present. */
export function Overlay({ host, client, token, branch, path: pathOverride }: OverlayProps) {
  useLayoutVersion();
  const path = useCurrentPath(pathOverride);
  const reducedMotion = useReducedMotion();
  const [reviewerName, rememberName] = useReviewerName();
  const [commentMode, setCommentMode] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // A live region only speaks when its text changes, so a repeat of the same
  // message ("Reply sent." twice) toggles a trailing no-break space.
  const announce = useCallback(
    (text: string) =>
      setAnnouncement((previous) => (previous === text ? text + NO_BREAK_SPACE : text)),
    [],
  );
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const deepLinkHandled = useRef(false);
  const focusToolbar = useCallback(() => commentButtonRef.current, []);
  const popover = useClosable<OpenPopover>(EXIT_DURATION_MS, focusToolbar);
  const latestPopover = useLatest({ value: popover.value, closing: popover.closing });

  const openDeepLinkedPin = (pins: Pin[]) => {
    if (deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const pinId = readPinParam(window.location.search);
    if (!pinId) return;
    const pin = pins.find((candidate) => candidate.id === pinId);
    if (!pin) {
      announce("The linked comment is not on this page.");
      return;
    }
    if (pin.resolved) setShowResolved(true);
    resolveSelector(pin.anchor.selector)?.scrollIntoView({
      block: "center",
      behavior: reducedMotion ? "auto" : "smooth",
    });
    popover.open({ kind: "thread", pinId: pin.id }, null);
  };

  const pinsApi = usePins({
    client,
    token,
    path,
    onUnauthorized: reviewTokenStore.clear,
    onLoaded: openDeepLinkedPin,
  });

  const ordered = useMemo(() => [...pinsApi.pins].sort(byCreatedAt), [pinsApi.pins]);
  const viewport = viewportSize();
  const placed = ordered.map((pin, index) => ({
    pin,
    number: index + 1,
    position: resolveAnchor(pin.anchor, viewport),
  }));
  const visible = showPins ? placed.filter(({ pin }) => showResolved || !pin.resolved) : [];
  const openCount = ordered.filter((pin) => !pin.resolved).length;

  const startComposer = (element: Element, point: Point) => {
    const trigger = deepActiveElement();
    setCommentMode(false);
    popover.open(
      {
        kind: "composer",
        anchor: computeAnchor(element, point, viewportSize()),
        number: ordered.length + 1,
        key: Date.now(),
      },
      trigger,
    );
  };
  const target = useCommentMode({ active: commentMode, host, onPick: startComposer });

  const toggleCommentMode = () => {
    const next = !commentMode;
    if (next && popover.value) popover.close({ restoreFocus: false });
    setCommentMode(next);
    announce(
      next
        ? "Comment mode on. Click an element, or use Tab or arrow keys and press Enter."
        : "Comment mode off.",
    );
  };

  const handleEscape = useLatest((event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (popover.value && !popover.closing) {
      event.stopPropagation();
      popover.close();
    } else if (commentMode) {
      event.stopPropagation();
      setCommentMode(false);
      announce("Comment mode off.");
      commentButtonRef.current?.focus();
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleEscape.current(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleEscape]);

  const submitComment = async (composerKey: number, anchor: PinAnchor, values: ComposerValues) => {
    rememberName(values.author);
    const screenshot = await captureViewport({
      exclude: host,
      marker: resolveAnchor(anchor, viewportSize()),
    });
    const pin = await pinsApi.createPin({
      path,
      pageUrl: cleanPageUrl(window.location.href),
      anchor,
      author: values.author,
      body: values.body,
      priority: values.priority,
      screenshot,
      context: { viewport: viewportSize(), userAgent: navigator.userAgent },
    });
    announce(`Comment by ${pin.author} posted.`);
    // Screenshot + request can take seconds. If the reviewer cancelled, or opened
    // a pin or comment mode meanwhile, do not close (or steal focus from) that.
    const latest = latestPopover.current;
    if (latest.value?.kind === "composer" && latest.value.key === composerKey && !latest.closing) {
      popover.close();
    }
  };

  const replyTo = async (pinId: string, values: ReplyValues) => {
    rememberName(values.author);
    await pinsApi.addReply({ pinId, author: values.author, body: values.body });
    announce("Reply sent.");
  };

  const resolve = async (pinId: string) => {
    await pinsApi.resolvePin({ pinId, author: reviewerName || "Anonymous" });
    announce("Comment resolved.");
  };

  const openThread = (pinId: string, trigger: HTMLElement) => {
    const current = popover.value;
    if (current?.kind === "thread" && current.pinId === pinId && popover.closing) return;
    setCommentMode(false);
    popover.open({ kind: "thread", pinId }, trigger);
  };

  const current = popover.value;
  const composerPosition =
    current?.kind === "composer" ? resolveAnchor(current.anchor, viewport) : null;
  const thread =
    current?.kind === "thread" ? placed.find(({ pin }) => pin.id === current.pinId) : undefined;

  return (
    <>
      <HoverOutline element={target?.element ?? null} />

      {visible.map(({ pin, number, position }) => (
        <PinBadge
          key={pin.id}
          number={number}
          position={position}
          detached={position.detached}
          resolved={pin.resolved}
          expanded={thread?.pin.id === pin.id && !popover.closing}
          label={pinLabel(pin, number, position.detached)}
          onOpen={(trigger) => openThread(pin.id, trigger)}
        />
      ))}

      {current?.kind === "composer" && composerPosition ? (
        <>
          {popover.closing ? null : (
            <PinBadge
              number={current.number}
              position={composerPosition}
              detached={composerPosition.detached}
              label="New comment"
            />
          )}
          <Composer
            key={current.key}
            number={current.number}
            anchor={badgeRect(composerPosition)}
            closing={popover.closing}
            defaultName={reviewerName}
            onSubmit={(values) => submitComment(current.key, current.anchor, values)}
            onClose={popover.close}
          />
        </>
      ) : null}

      {thread ? (
        <Thread
          key={thread.pin.id}
          pin={thread.pin}
          number={thread.number}
          detached={thread.position.detached}
          anchor={badgeRect(thread.position)}
          closing={popover.closing}
          reviewerName={reviewerName}
          onReply={(values) => replyTo(thread.pin.id, values)}
          onResolve={() => resolve(thread.pin.id)}
          onClose={popover.close}
        />
      ) : null}

      <Toolbar
        commentMode={commentMode}
        commentButtonRef={commentButtonRef}
        onToggleComment={toggleCommentMode}
        status={pinsApi.status}
        openCount={openCount}
        resolvedCount={ordered.length - openCount}
        showPins={showPins}
        onToggleShowPins={() => setShowPins((value) => !value)}
        showResolved={showResolved}
        onToggleShowResolved={() => setShowResolved((value) => !value)}
        branch={branch}
        onRetry={pinsApi.retry}
      />

      <div className="pp-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <div className="pp-sr-only" aria-live="polite">
        {target?.source === "keyboard" ? `Targeting ${describeElement(target.element)}` : ""}
      </div>
    </>
  );
}
