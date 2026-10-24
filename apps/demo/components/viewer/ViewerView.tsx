"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RESOLVED_HOP } from "../brand/mascot/moods";
import { toPagePx } from "@/lib/crop/geometry";
import { planCommentCrop } from "@/lib/crop/plan-comment-crop";
import { renderCrop } from "@/lib/crop/render-crop";
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
import { CanvasLayer } from "./CanvasLayer";
import { CommentsBody } from "./CommentsBody";
import { CommentsPanel } from "./CommentsPanel";
import { ExportMenu } from "./ExportMenu";
import { commentSurfaceKey, placementOf, surfaceKey } from "./surface";
import { useCommentActions } from "./use-comment-actions";
import { useViewerSurface } from "./use-viewer-surface";
import { ViewerStage } from "./ViewerStage";
import { ViewerTopBar } from "./ViewerTopBar";
import type { DraftStorage } from "@/lib/share-client/draft-storage";
import type { CommentTab, Draft, PinPoint, ScreenshotHandler } from "./types";

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

const RESTORED = "This comment wasn't sent before the page closed. Post it now, or cancel it.";

/** A draft kept from before a reload, shown as unsent until it's posted. */
function restoreDraft(storage: DraftStorage | undefined): Draft | null {
  const stored = storage?.load();
  return stored ? { ...stored, sending: false, error: RESTORED, crop: null } : null;
}

type ScrollRequest = { id: string; target: "pin" | "card"; nonce: number } | null;

/**
 * Viewer layout and state: mode, surface, tab, selection, draft pin, and
 * comment actions. Changes go through the viewer backend (the owner's store or
 * a shared link's server); on a shared link, moderation controls are hidden.
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
  });
  const [tab, setTab] = useState<CommentTab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const { mode, setMode, surface } = view;
  const { source } = project;
  const stageKey = surfaceKey(surface);
  const comments = useMemo(() => commentsFor(data, project.id), [data, project.id]);
  const numbers = useMemo(() => pinNumbers(comments), [comments]);
  const onStage = comments.filter(
    (comment) => commentSurfaceKey(comment, source.kind) === stageKey,
  );
  const placements = useMemo(
    () =>
      new Map(
        comments.map((comment) => [
          comment.id,
          placementOf(comment, source.kind, view.snapshots, view.latest?.id ?? null),
        ]),
      ),
    [comments, source.kind, view.snapshots, view.latest],
  );
  const counts = countComments(comments);
  const originalUrl = source.kind === "url" ? source.url : (source.referenceUrl ?? null);
  const stageDraft = draft?.surfaceKey === stageKey ? draft : null;

  useShortcut("c", () => setMode(mode === "comment" ? "browse" : "comment"));
  useShortcut("escape", () => setMode("browse"), mode === "comment" && !stageDraft);

  const unsent = Boolean(draftStorage && draft?.body.trim());

  // Keep the draft with text across a reload; drop it once posted or cancelled.
  useEffect(() => {
    if (!draftStorage) return;
    if (!draft?.body.trim()) {
      draftStorage.save(null);
      return;
    }
    const { x, y, body, surfaceKey, snapshotId, commentId, author } = draft;
    draftStorage.save({
      x,
      y,
      body,
      surfaceKey,
      snapshotId,
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
    const shown = commentSurfaceKey(comment, source.kind) === stageKey;
    const next = selectedId === id && from === "card" && shown ? null : id;
    setSelectedId(next);
    if (!next) return;
    if (from === "pin") {
      if (comment.status === "resolved") setTab("resolved");
      setSheetOpen(true);
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
    setDraft({
      ...point,
      body: draft?.body ?? "",
      surfaceKey: stageKey,
      snapshotId: surface.kind === "snapshot" ? (surface.snapshot?.id ?? null) : null,
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
      draft.snapshotId ? { ...input, snapshotId: draft.snapshotId } : input,
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

  const commentActions = useCommentActions({
    backend,
    toast,
    onResolved: celebrate,
    onRemoved: (id) => setSelectedId((current) => (current === id ? null : current)),
  });

  const saveScreenshot: ScreenshotHandler = async (image) => {
    const referenceUrl = source.kind === "url" ? source.url : source.referenceUrl;
    const result = await backend.replaceWithImage(project.id, image, referenceUrl);
    if (result.ok) view.showLatest();
    return result.ok ? null : result.error;
  };

  const overlay = (
    <CanvasLayer
      comments={onStage}
      numbers={numbers}
      tab={tab}
      mode={mode}
      selectedId={selectedId}
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
      comments={comments}
      numbers={numbers}
      placements={placements}
      tab={tab}
      onTab={setTab}
      selectedId={selectedId}
      now={now}
      listRef={listRef}
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
            onShowLatest={view.showLatest}
            onBrowse={() => setMode("browse")}
            onScreenshot={owner ? saveScreenshot : null}
          />
        </main>
        <CommentsPanel
          docked={docked}
          sheetOpen={sheetOpen}
          onToggleSheet={() => setSheetOpen((value) => !value)}
          active={counts.active}
          resolved={counts.resolved}
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
