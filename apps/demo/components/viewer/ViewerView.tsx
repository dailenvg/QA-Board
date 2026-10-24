"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESOLVED_HOP } from "../brand/mascot/moods";
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
import { ImageStage } from "./ImageStage";
import { UrlStage } from "./UrlStage";
import { ViewerTopBar } from "./ViewerTopBar";
import type { CommentTab, Draft, PinPoint, ViewerMode } from "./types";

/** One celebration: the mascot's hop plus its rest beat. */
const CELEBRATION_MS = RESOLVED_HOP * 2 * 1000;

interface ViewerViewProps {
  data: SquintData;
  project: Project;
}

type ScrollRequest = { id: string; target: "pin" | "card"; nonce: number } | null;

/** Viewer layout and state: mode, tab, selection, draft pin, and comment actions. */
export function ViewerView({ data, project }: ViewerViewProps) {
  const toast = useToast();
  const now = useNow();
  const reduce = useReducedMotion();
  const docked = !useMediaQuery("(min-width: 1024px)");
  const [mode, setMode] = useState<ViewerMode>("browse");
  const [tab, setTab] = useState<CommentTab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest>(null);
  const [celebrating, celebrate] = useTimedFlag(CELEBRATION_MS);
  const deleting = useDialogState<Comment>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [frameCommentable, setFrameCommentable] = useState(false);

  const comments = useMemo(() => commentsFor(data, project.id), [data, project.id]);
  const numbers = useMemo(() => pinNumbers(comments), [comments]);
  const counts = countComments(comments);
  const folder = data.folders.find((entry) => entry.id === project.folderId);
  const { source } = project;
  const originalUrl = source.kind === "url" ? source.url : (source.referenceUrl ?? null);
  // While a site is being checked or a fallback replaces it there's nothing to pin, so
  // Comment mode is unavailable (and shown as such) instead of silently doing nothing.
  const canComment = source.kind === "image" || frameCommentable;
  const activeMode: ViewerMode = canComment ? mode : "browse";

  useShortcut("c", () => {
    if (canComment) setMode(activeMode === "comment" ? "browse" : "comment");
  });
  useShortcut("escape", () => setMode("browse"), activeMode === "comment" && !draft);

  /** After the composer closes, keyboard users carry on from the canvas instead of the page top. */
  const returnFocusToCanvas = () => overlayRef.current?.focus({ preventScroll: true });

  // Entering Comment mode (toolbar or C) puts focus on the canvas, so the arrow keys and
  // Enter place a pin right away instead of Tab first walking the framed site.
  useEffect(() => {
    if (activeMode === "comment") overlayRef.current?.focus({ preventScroll: true });
  }, [activeMode]);

  // Bring the other half of a selection into view once React has rendered it.
  useEffect(() => {
    if (!scrollRequest) return;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const selector =
      scrollRequest.target === "pin"
        ? `[data-pin-id="${CSS.escape(scrollRequest.id)}"]`
        : `[data-comment-id="${CSS.escape(scrollRequest.id)}"]`;
    const root = scrollRequest.target === "card" ? listRef.current : document;
    root
      ?.querySelector(selector)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
  }, [scrollRequest, reduce]);

  const select = (id: string, from: "pin" | "card") => {
    const comment = comments.find((entry) => entry.id === id);
    if (!comment) return;
    const next = selectedId === id && from === "card" ? null : id;
    setSelectedId(next);
    if (!next) return;
    if (from === "pin") {
      if (comment.status === "resolved") setTab("resolved");
      setSheetOpen(true);
    }
    setScrollRequest({ id, target: from === "pin" ? "card" : "pin", nonce: Date.now() });
  };

  const place = (point: PinPoint) => {
    if (draft?.body.trim()) {
      composerRef.current?.focus();
      return;
    }
    setSelectedId(null);
    setDraft({ ...point, body: draft?.body ?? "" });
  };

  const submitDraft = (body: string, author: string) => {
    if (!draft) return;
    if (author.trim() !== data.authorName) setAuthorName(author);
    const result = addComment({ projectId: project.id, x: draft.x, y: draft.y, body, author });
    if (!result.ok) {
      toast({ tone: "error", message: result.error });
      return;
    }
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
    return result.ok ? null : result.error;
  };

  const overlay = (
    <CanvasLayer
      comments={comments}
      numbers={numbers}
      tab={tab}
      mode={activeMode}
      selectedId={selectedId}
      draft={draft}
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
        mode={activeMode}
        onMode={setMode}
        commentAvailable={canComment}
        originalUrl={originalUrl}
      />
      <div className="flex min-h-0 flex-1 gap-4">
        <main
          id="main"
          data-testid="canvas-area"
          data-mode={activeMode}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto rounded-panel bg-tile"
        >
          {source.kind === "url" ? (
            <UrlStage
              url={source.url}
              projectName={project.name}
              overlay={overlay}
              onScreenshot={replaceWithImage}
              onCommentableChange={setFrameCommentable}
              commentMode={activeMode === "comment"}
            />
          ) : (
            <ImageStage
              dataUrl={source.dataUrl}
              projectName={project.name}
              overlay={overlay}
              onReplace={replaceWithImage}
            />
          )}
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
