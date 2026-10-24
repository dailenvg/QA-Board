"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESOLVED_HOP } from "../brand/mascot/moods";
import { planCommentCrop, saveCommentCrop } from "@/lib/crop/save-comment-crop";
import {
  addComment,
  deleteComment,
  editComment,
  replaceProjectSource,
  restoreComment,
  setAuthorName,
  setCommentStatus,
} from "@/lib/store/actions";
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
import { CanvasLayer } from "./CanvasLayer";
import { CommentsBody } from "./CommentsBody";
import { CommentsPanel } from "./CommentsPanel";
import { commentSurfaceKey, placementOf, surfaceKey } from "./surface";
import { useViewerSurface } from "./use-viewer-surface";
import { ViewerStage } from "./ViewerStage";
import { ViewerTopBar } from "./ViewerTopBar";
import type { CommentTab, Draft, PinPoint } from "./types";

/** One celebration: the mascot's hop plus its rest beat. */
const CELEBRATION_MS = RESOLVED_HOP * 2 * 1000;

interface ViewerViewProps {
  data: SquintData;
  project: Project;
}

type ScrollRequest = { id: string; target: "pin" | "card"; nonce: number } | null;

/** Viewer layout and state: mode, surface, tab, selection, draft pin, and comment actions. */
export function ViewerView({ data, project }: ViewerViewProps) {
  const toast = useToast();
  const now = useNow();
  const reduce = useReducedMotion();
  const docked = !useMediaQuery("(min-width: 1024px)");
  const view = useViewerSurface(project, data);
  const [tab, setTab] = useState<CommentTab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
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
  const folder = data.folders.find((entry) => entry.id === project.folderId);
  const originalUrl = source.kind === "url" ? source.url : (source.referenceUrl ?? null);
  const stageDraft = draft?.surfaceKey === stageKey ? draft : null;

  useShortcut("c", () => setMode(mode === "comment" ? "browse" : "comment"));
  useShortcut("escape", () => setMode("browse"), mode === "comment" && !stageDraft);

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
    });
  };

  const submitDraft = (body: string, author: string) => {
    if (!draft) return;
    if (author.trim() !== data.authorName) setAuthorName(author);
    const image = imageRef.current;
    const area = canvasAreaRef.current;
    // Read what's on screen now, before posting re-renders or scrolls anything.
    const crop =
      image && area && surface.kind !== "frame" ? planCommentCrop(image, area, draft) : null;
    const result = addComment({
      projectId: project.id,
      x: draft.x,
      y: draft.y,
      body,
      author,
      ...(draft.snapshotId ? { snapshotId: draft.snapshotId } : {}),
    });
    if (!result.ok) {
      toast({ tone: "error", message: result.error });
      return;
    }
    if (image && crop) void saveCommentCrop(result.value.id, image, crop);
    setDraft(null);
    setTab("active");
    setSelectedId(result.value.id);
    returnFocusToCanvas();
  };

  const resolve = (id: string) => {
    const result = setCommentStatus(id, "resolved");
    if (!result.ok) {
      toast({ tone: "error", message: result.error });
      return;
    }
    if (selectedId === id) setSelectedId(null);
    celebrate();
    toast({
      message: "Comment resolved",
      action: { label: "Undo", onAction: () => setCommentStatus(id, "active") },
    });
  };

  const reopen = (id: string) => {
    const result = setCommentStatus(id, "active");
    toast(result.ok ? { message: "Comment reopened" } : { tone: "error", message: result.error });
  };

  const edit = (id: string, body: string) => {
    const result = editComment(id, body);
    if (!result.ok) toast({ tone: "error", message: result.error });
  };

  const replaceWithImage = (image: { dataUrl: string; fileName: string }) => {
    const referenceUrl = source.kind === "url" ? source.url : source.referenceUrl;
    const result = replaceProjectSource(project.id, {
      kind: "image",
      ...image,
      ...(referenceUrl ? { referenceUrl } : {}),
    });
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
      onDraftSubmit={submitDraft}
      onDraftCancel={() => {
        setDraft(null);
        returnFocusToCanvas();
      }}
    />
  );

  // Room for the docked comments sheet's header, plus the home-indicator inset. Repeated at
  // `sm:` because `sm:p-4` would otherwise reset the bottom padding on tablets.
  const sheetSpace = docked
    ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
    : "";

  return (
    <div className={`flex h-dvh flex-col gap-3 p-3 sm:gap-4 sm:p-4 ${sheetSpace}`}>
      <ViewerTopBar
        project={project}
        folder={folder}
        status={deriveStatus(counts)}
        mode={mode}
        onMode={setMode}
        originalUrl={originalUrl}
      />
      <div className="flex min-h-0 flex-1 gap-4">
        <main
          id="main"
          ref={canvasAreaRef}
          data-testid="canvas-area"
          data-mode={mode}
          data-surface={surface.kind}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto rounded-panel bg-tile"
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
            onScreenshot={replaceWithImage}
          />
        </main>
        <CommentsPanel
          docked={docked}
          sheetOpen={sheetOpen}
          onToggleSheet={() => setSheetOpen((value) => !value)}
          active={counts.active}
          resolved={counts.resolved}
          celebrating={celebrating}
        >
          <CommentsBody
            comments={comments}
            numbers={numbers}
            placements={placements}
            tab={tab}
            onTab={setTab}
            selectedId={selectedId}
            now={now}
            listRef={listRef}
            onSelect={(id) => select(id, "card")}
            onEdit={edit}
            onResolve={resolve}
            onReopen={reopen}
            onDelete={deleting.show}
          />
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
          if (!target) return;
          if (selectedId === target.id) setSelectedId(null);
          const result = deleteComment(target.id);
          if (!result.ok) {
            toast({ tone: "error", message: result.error });
            return;
          }
          toast({
            message: "Comment deleted",
            action: {
              label: "Undo",
              onAction: () => {
                const restored = restoreComment(target);
                if (!restored.ok) toast({ tone: "error", message: restored.error });
              },
            },
          });
        }}
      />
    </div>
  );
}
