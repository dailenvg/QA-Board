"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { RESOLVED_HOP } from "../brand/mascot/moods";
import { toPagePx } from "@/lib/crop/geometry";
import { planCommentCrop } from "@/lib/crop/plan-comment-crop";
import { renderCrop } from "@/lib/crop/render-crop";
import {
  activeByBreakpoint,
  BREAKPOINT_WIDTH,
  breakpointOfComment,
  type Breakpoint,
} from "@/lib/store/breakpoints";
import { newId } from "@/lib/store/id";
import { commentsFor, pinNumbers } from "@/lib/store/selectors";
import { countComments, deriveStatus } from "@/lib/store/status";
import type { Comment, Project, SquintData } from "@/lib/store/types";
import { useDialogState } from "@/lib/use-dialog-state";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNow } from "@/lib/use-now";
import { useShortcut } from "@/lib/use-shortcut";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/ToastProvider";
import { useViewerBackend, type PendingCrop } from "@/lib/viewer-backend/backend";
import { BREAKPOINT_LABEL, BreakpointSwitch } from "./BreakpointSwitch";
import { CanvasLayer } from "./CanvasLayer";
import { CommentsBody } from "./CommentsBody";
import { CommentsPanel } from "./CommentsPanel";
import { ExportMenu } from "./ExportMenu";
import { PinPopover } from "./PinPopover";
import { commentSurfaceKey, placementOf, surfaceKey } from "./surface";
import { useCommentActions } from "./use-comment-actions";
import { useViewerSurface } from "./use-viewer-surface";
import { ViewerStage } from "./ViewerStage";
import { ViewerTopBar } from "./ViewerTopBar";
import type { DraftStorage } from "@/lib/share-client/draft-storage";
import type { CommentTab, Draft, PinPoint, ScreenshotHandler, ViewerMode } from "./types";

/** One celebration: the mascot's hop plus its rest beat. */
const CELEBRATION_MS = RESOLVED_HOP * 2 * 1000;

interface ViewerViewProps {
  data: SquintData;
  project: Project;
  /** Start of the top bar: a way back for the owner, the logo on a shared link. */
  leading: ReactNode;
  /** Extra top-bar actions, such as the owner's Share button. */
  actions?: ReactNode;
  /** Shown above the comment list on wide screens, such as what a client can do on a shared link. */
  panelNotice?: ReactNode;
  /** Its short form, shown in the comments sheet's header on phones (visible while collapsed). */
  panelNote?: string;
  /** Keeps an unsent draft across reloads (shared links), and warns before leaving it. */
  draftStorage?: DraftStorage;
}

const RESTORED = "This comment wasn't sent before the page closed. Retry to post it, or cancel it.";

/** A draft kept from before a reload, shown as unsent until it's posted. */
function restoreDraft(storage: DraftStorage | undefined): Draft | null {
  const stored = storage?.load();
  return stored
    ? { ...stored, pageId: stored.pageId ?? null, sending: false, error: RESTORED, crop: null }
    : null;
}

type ScrollRequest = { id: string; target: "pin" | "card"; nonce: number } | null;

/**
 * Viewer layout and state: mode, breakpoint, surface, tab, selection, the open
 * pin popover, draft pin, and comment actions. Changes go through the viewer
 * backend (the owner's store or a shared link's server); on a shared link,
 * moderation controls are hidden. Website comments are listed and pinned per
 * breakpoint; pin numbers stay project-wide, so exports and shared links match.
 */
export function ViewerView({
  data,
  project,
  leading,
  actions,
  panelNotice,
  panelNote,
  draftStorage,
}: ViewerViewProps) {
  const toast = useToast();
  const backend = useViewerBackend();
  const owner = backend.role === "owner";
  const now = useNow();
  const reduce = useReducedMotion();
  const docked = !useMediaQuery("(min-width: 1024px)");
  const [draft, setDraft] = useState<Draft | null>(() => restoreDraft(draftStorage));
  const view = useViewerSurface(project, data, {
    mode: draft ? "comment" : "browse",
    snapshotId: draft?.snapshotId ?? null,
    pageId: draft?.pageId ?? null,
  });
  const [tab, setTab] = useState<CommentTab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The pin whose comment popover is open. */
  const [openId, setOpenId] = useState<string | null>(null);
  const popoverId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest>(null);
  /** Bumped whenever an image surface finishes loading, so pins drawn on it can be found. */
  const [stageVersion, setStageVersion] = useState(0);
  const [celebrating, celebrate] = useTimedFlag(CELEBRATION_MS);
  const deleting = useDialogState<Comment>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const handledScroll = useRef(0);
  const focusCanvasPending = useRef(false);

  const { mode, surface, breakpoint, snapshots, latestOf } = view;
  const { source } = project;
  const website = source.kind === "url";
  const stageKey = surfaceKey(surface);
  const comments = useMemo(() => commentsFor(data, project.id), [data, project.id]);
  const numbers = useMemo(() => pinNumbers(comments), [comments]);
  /** The comments at the current breakpoint (all of them on page projects). */
  const listed = useMemo(
    () =>
      website
        ? comments.filter((comment) => breakpointOfComment(comment, snapshots) === breakpoint)
        : comments,
    [website, comments, snapshots, breakpoint],
  );
  const onStage = listed.filter((comment) => commentSurfaceKey(comment) === stageKey);
  // Resolved pins only show on the Resolved tab.
  const pins =
    tab === "active" ? onStage.filter((comment) => comment.status === "active") : onStage;
  const openComment = pins.find((comment) => comment.id === openId) ?? null;
  const placements = useMemo(
    () =>
      new Map(
        comments.map((comment) => {
          const at = website ? breakpointOfComment(comment, snapshots) : breakpoint;
          const latestId = latestOf(at)?.id ?? null;
          return [comment.id, placementOf(comment, source.kind, snapshots, latestId)];
        }),
      ),
    [comments, website, source.kind, snapshots, breakpoint, latestOf],
  );
  const counts = countComments(comments);
  const listedCounts = countComments(listed);
  const breakpointCounts = useMemo(
    () => activeByBreakpoint(comments, snapshots),
    [comments, snapshots],
  );
  const originalUrl = source.kind === "url" ? source.url : (source.referenceUrl ?? null);
  const stageDraft = draft?.surfaceKey === stageKey ? draft : null;

  /** Mode and breakpoint changes swap the stage, so they close an open popover. */
  const setMode = (next: ViewerMode) => {
    setOpenId(null);
    view.setMode(next);
  };
  const setBreakpoint = (next: Breakpoint) => {
    setOpenId(null);
    view.setBreakpoint(next);
  };
  const changeTab = (next: CommentTab) => {
    if (next !== tab) setOpenId(null);
    setTab(next);
  };

  useShortcut("c", () => setMode(mode === "comment" ? "browse" : "comment"));
  // The open popover takes Escape first.
  useShortcut("escape", () => setMode("browse"), mode === "comment" && !stageDraft && !openComment);

  const unsent = Boolean(draftStorage && draft?.body.trim());

  // Keep the draft with text across a reload; drop it once posted or cancelled.
  useEffect(() => {
    if (!draftStorage) return;
    if (!draft?.body.trim()) {
      draftStorage.save(null);
      return;
    }
    const { x, y, body, surfaceKey, snapshotId, pageId, commentId, author } = draft;
    draftStorage.save({
      x,
      y,
      body,
      surfaceKey,
      snapshotId,
      pageId,
      commentId,
      ...(author ? { author } : {}),
    });
  }, [draft, draftStorage]);

  // Leaving with an unsent comment asks first.
  useEffect(() => {
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  /** After the composer closes, keyboard users carry on from the canvas instead of the page top. */
  const returnFocusToCanvas = () => overlayRef.current?.focus({ preventScroll: true });

  // Entering Comment mode (toolbar or C) puts focus on the canvas, so the arrow keys and
  // Enter place a pin right away. A snapshot may still be loading, so this waits for it.
  useEffect(() => {
    focusCanvasPending.current = mode === "comment";
  }, [mode]);
  useEffect(() => {
    if (!focusCanvasPending.current || !overlayRef.current) return;
    focusCanvasPending.current = false;
    overlayRef.current.focus({ preventScroll: true });
  }, [mode, stageVersion]);

  // Bring the other half of a selection into view once React has rendered it (and, for a
  // pin on another snapshot, once that snapshot has loaded).
  useEffect(() => {
    if (!scrollRequest || handledScroll.current === scrollRequest.nonce) return;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const selector =
      scrollRequest.target === "pin"
        ? `[data-pin-id="${CSS.escape(scrollRequest.id)}"]`
        : `[data-comment-id="${CSS.escape(scrollRequest.id)}"]`;
    const root = scrollRequest.target === "card" ? listRef.current : document;
    const element = root?.querySelector(selector);
    if (!element) return;
    handledScroll.current = scrollRequest.nonce;
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
  }, [scrollRequest, reduce, stageVersion]);

  const select = (id: string, from: "pin" | "card") => {
    const comment = comments.find((entry) => entry.id === id);
    if (!comment) return;
    // A second click on a card deselects it, unless its pin is on another surface: then it shows it.
    const shown = commentSurfaceKey(comment) === stageKey;
    const next = selectedId === id && from === "card" && shown ? null : id;
    setSelectedId(next);
    // A pin toggles its popover. On phones and tablets it's the pin's detail view, so the
    // comments sheet stays as it is rather than opening over it.
    setOpenId(from === "pin" && openId !== id ? id : null);
    if (!next) return;
    if (from === "pin") {
      if (comment.status === "resolved") setTab("resolved");
    } else {
      view.showSurfaceOf(comment);
    }
    setScrollRequest({ id, target: from === "pin" ? "card" : "pin", nonce: Date.now() });
  };

  const place = (point: PinPoint) => {
    if (stageDraft?.body.trim()) {
      composerRef.current?.focus();
      return;
    }
    setSelectedId(null);
    setOpenId(null);
    setDraft({
      ...point,
      body: draft?.body ?? "",
      surfaceKey: stageKey,
      snapshotId: surface.kind === "snapshot" ? (surface.snapshot?.id ?? null) : null,
      pageId: surface.kind === "page" ? surface.page.id : null,
      commentId: newId(),
      sending: false,
      error: null,
      crop: null,
    });
  };

  /** Reads what's on screen now, before posting re-renders or scrolls anything. */
  const cropFor = (point: PinPoint): PendingCrop | null => {
    const image = imageRef.current;
    const area = canvasAreaRef.current;
    if (!image || !area || surface.kind === "frame") return null;
    const plan = planCommentCrop(image, area, point);
    if (!plan) return null;
    // Crops are cut in image px; the stored rect is in page px (they differ on a scaled-down snapshot).
    const scale = surface.kind === "snapshot" ? (surface.snapshot?.scale ?? 1) : 1;
    return { blob: renderCrop(image, plan), rect: toPagePx(plan.rect, scale) };
  };

  /**
   * Posts the draft. The composer stays open with its text until the comment
   * is saved; a failure shows inline with Retry, and the pin is marked unsent.
   */
  const submitDraft = async (body: string, author: string) => {
    if (!draft || draft.sending) return;
    if (author.trim() !== data.authorName) backend.setAuthorName(author);
    const crop = draft.crop ?? cropFor(draft);
    const sending = { ...draft, body, crop, sending: true, error: null };
    setDraft(sending);
    const input = {
      id: draft.commentId,
      projectId: project.id,
      x: draft.x,
      y: draft.y,
      body,
      author,
    };
    const result = await backend.addComment(
      {
        ...input,
        ...(draft.snapshotId ? { snapshotId: draft.snapshotId } : {}),
        ...(draft.pageId ? { pageId: draft.pageId } : {}),
      },
      crop,
    );
    if (!result.ok) {
      setDraft((current) =>
        current?.commentId === sending.commentId
          ? { ...current, sending: false, error: result.error }
          : current,
      );
      return;
    }
    setDraft((current) => (current?.commentId === sending.commentId ? null : current));
    setTab("active");
    setSelectedId(result.value.id);
    returnFocusToCanvas();
  };

  const forget = (id: string) => setSelectedId((current) => (current === id ? null : current));

  const commentActions = useCommentActions({
    backend,
    toast,
    onResolved: (id) => {
      forget(id);
      celebrate();
      // On the Active tab a resolved pin leaves the stage (from its card too), so Undo
      // mustn't bring its popover back.
      if (tab === "active") setOpenId((current) => (current === id ? null : current));
    },
    // Undo brings a deleted comment back, but not its popover.
    onRemoved: (id) => {
      forget(id);
      setOpenId((current) => (current === id ? null : current));
    },
  });

  /** Escape and the close button hand focus back to the pin; a click elsewhere keeps it there. */
  const closePopover = (returnFocus: boolean) => {
    const id = openId;
    setOpenId(null);
    if (!returnFocus || !id) return;
    const pin = document.querySelector<HTMLElement>(`[data-pin-id="${CSS.escape(id)}"]`);
    if (pin) pin.focus({ preventScroll: true });
    else returnFocusToCanvas();
  };

  /** On the Active tab a resolved pin leaves the stage, so its popover closes with it. */
  const resolveFromPopover = (id: string) => {
    commentActions.resolve(id);
    if (tab !== "active") return;
    setOpenId(null);
    returnFocusToCanvas();
  };

  const saveScreenshot: ScreenshotHandler = async (image) => {
    const referenceUrl = source.kind === "url" ? source.url : source.referenceUrl;
    const pageId = surface.kind === "page" ? surface.page.id : null;
    const result = await backend.replaceWithImage(project.id, image, { referenceUrl, pageId });
    if (result.ok) view.showLatest();
    return result.ok ? null : result.error;
  };

  const popover = openComment ? (
    <PinPopover
      key={openComment.id}
      id={popoverId}
      comment={openComment}
      number={numbers.get(openComment.id) ?? 0}
      placement={placements.get(openComment.id) ?? null}
      now={now}
      canModerate={owner}
      onResolve={resolveFromPopover}
      onReopen={commentActions.reopen}
      onClose={closePopover}
    />
  ) : null;

  const overlay = (
    <CanvasLayer
      comments={pins}
      numbers={numbers}
      mode={mode}
      selectedId={selectedId}
      openId={openComment?.id ?? null}
      popoverId={popoverId}
      popover={popover}
      draft={stageDraft}
      authorName={data.authorName}
      composerRef={composerRef}
      overlayRef={overlayRef}
      onSelect={(id) => select(id, "pin")}
      onPlace={place}
      onExitComment={() => setMode("browse")}
      onDraftChange={(body) => setDraft((current) => (current ? { ...current, body } : current))}
      onDraftAuthorChange={(author) =>
        setDraft((current) => (current ? { ...current, author } : current))
      }
      onDraftSubmit={(body, author) => void submitDraft(body, author)}
      onDraftCancel={() => {
        // A draft being posted can't be cancelled: it would still arrive.
        if (draft?.sending) return;
        setDraft(null);
        returnFocusToCanvas();
      }}
    />
  );

  // Room for the docked comments sheet's header, plus the home-indicator inset. Repeated at
  // `sm:` because `sm:p-4` would otherwise reset the bottom padding on tablets.
  const sheetNote = docked ? panelNote : undefined;
  const sheetSpace = !docked
    ? ""
    : sheetNote
      ? "pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-[calc(7rem+env(safe-area-inset-bottom))]"
      : "pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))]";
  // The snapshot bar is sticky at the top of the canvas; keep focused and scrolled-to pins
  // below it rather than under it (WCAG 2.4.11).
  const scrollInset = surface.kind === "snapshot" ? "scroll-pt-28" : "";

  const commentsBody = (
    <CommentsBody
      comments={listed}
      numbers={numbers}
      placements={placements}
      tab={tab}
      selectedId={selectedId}
      now={now}
      listRef={listRef}
      // With comments at another breakpoint, an empty list names this one.
      scope={website && comments.length > listed.length ? BREAKPOINT_LABEL[breakpoint] : undefined}
      canModerate={owner}
      onSelect={(id) => select(id, "card")}
      onEdit={commentActions.edit}
      onResolve={commentActions.resolve}
      onReopen={commentActions.reopen}
      onDelete={deleting.show}
    />
  );

  return (
    <div className={`flex h-dvh flex-col gap-3 p-3 sm:gap-4 sm:p-4 ${sheetSpace}`}>
      <ViewerTopBar
        project={project}
        leading={leading}
        status={deriveStatus(counts)}
        mode={mode}
        onMode={setMode}
        originalUrl={originalUrl}
        breakpoints={
          website ? (
            <BreakpointSwitch
              value={breakpoint}
              onChange={setBreakpoint}
              counts={breakpointCounts}
            />
          ) : null
        }
        actions={
          <>
            <ExportMenu data={data} project={project} commentCount={comments.length} />
            {actions}
          </>
        }
      />
      <div className="flex min-h-0 flex-1 gap-4">
        <main
          id="main"
          ref={canvasAreaRef}
          data-testid="canvas-area"
          data-mode={mode}
          data-surface={surface.kind}
          className={`relative min-h-0 min-w-0 flex-1 overflow-auto rounded-panel bg-tile ${scrollInset}`}
        >
          <ViewerStage
            project={project}
            surface={surface}
            latest={view.latest}
            overlay={overlay}
            imageRef={imageRef}
            onReady={() => setStageVersion((value) => value + 1)}
            capture={view.capture.state}
            onCapture={view.capture.capture}
            frameWidth={website && breakpoint !== "desktop" ? BREAKPOINT_WIDTH[breakpoint] : null}
            onShowLatest={view.showLatest}
            onBrowse={() => setMode("browse")}
            onScreenshot={owner ? saveScreenshot : null}
          />
        </main>
        <CommentsPanel
          docked={docked}
          sheetOpen={sheetOpen}
          onSheetOpen={setSheetOpen}
          tab={tab}
          onTab={changeTab}
          active={listedCounts.active}
          resolved={listedCounts.resolved}
          celebrating={celebrating}
          note={sheetNote}
        >
          {panelNotice && !docked ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {panelNotice}
              {commentsBody}
            </div>
          ) : (
            commentsBody
          )}
        </CommentsPanel>
      </div>
      <ConfirmDialog
        open={deleting.open}
        onClose={deleting.close}
        title={
          deleting.payload
            ? `Delete comment ${numbers.get(deleting.payload.id) ?? ""}?`
            : "Delete comment?"
        }
        description="The comment and its pin will be removed. You'll have a few seconds to undo it."
        confirmLabel="Delete comment"
        onConfirm={() => {
          const target = deleting.payload;
          deleting.close();
          if (target) commentActions.remove(target);
        }}
      />
    </div>
  );
}
