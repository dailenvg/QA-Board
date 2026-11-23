"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { RESOLVED_HOP } from "../brand/mascot/moods";
import { captureClientInfo } from "@/lib/client-info/capture";
import { toPagePx } from "@/lib/crop/geometry";
import { planCommentCrop } from "@/lib/crop/plan-comment-crop";
import { onSurface } from "@/lib/crop/prepare-crop";
import { renderCrop } from "@/lib/crop/render-crop";
import {
  activeByBreakpoint,
  BREAKPOINT_WIDTH,
  breakpointOfComment,
  commentsAtBreakpoint,
  spansBreakpoints,
  type Breakpoint,
} from "@/lib/store/breakpoints";
import { newId } from "@/lib/store/id";
import { pagesOf } from "@/lib/store/pages";
import { commentsFor, pageCounts, pinNumbers } from "@/lib/store/selectors";
import { countComments, deriveStatus } from "@/lib/store/status";
import type { Comment, Project, SquintData } from "@/lib/store/types";
import { useDialogState } from "@/lib/use-dialog-state";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNow } from "@/lib/use-now";
import { useShortcut } from "@/lib/use-shortcut";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DeletionNotice } from "../ui/DeletionNotice";
import { DELETION_EXPLANATION, deletionWhen } from "../ui/deletion-when";
import type { MenuHandle } from "../ui/Menu";
import { useToast } from "../ui/ToastProvider";
import { useViewerBackend, type PendingCrop } from "@/lib/viewer-backend/backend";
import { useFrameCheck } from "@/lib/frame-check/use-frame-check";
import { can } from "@/lib/auth/permissions";
import { useWorkspaceAccess } from "@/lib/workspace-client/use-workspace-access";
import { BreakpointFilter, type BreakpointScope } from "./BreakpointFilter";
import { BREAKPOINT_LABEL, BreakpointSwitch } from "./BreakpointSwitch";
import { CanvasLayer } from "./CanvasLayer";
import { CommentsBody } from "./CommentsBody";
import { CommentsPanel } from "./CommentsPanel";
import { commentRights } from "./comment-rights";
import { DeleteOthersCommentDialog } from "./DeleteOthersCommentDialog";
import { ExportMenu } from "./ExportMenu";
import { GetInfoDialog } from "./GetInfoDialog";
import { rememberedMode, rememberMode } from "./mode-memory";
import { openingMode } from "./opening-mode";
import { PageFilter, type PageScope } from "./PageFilter";
import { PageStrip } from "./PageStrip";
import { PinPopover } from "./PinPopover";
import { sendDraft } from "./send-draft";
import { commentSurfaceKey, pinInSurface, placementOf, surfaceKey } from "./surface";
import { useCommentActions } from "./use-comment-actions";
import { useViewerDraft } from "./use-viewer-draft";
import { useViewerPage } from "./use-viewer-page";
import { useViewerSurface } from "./use-viewer-surface";
import { ViewerStage } from "./ViewerStage";
import { ViewerTopBar } from "./ViewerTopBar";
import type { DraftStorage } from "@/lib/share-client/draft-storage";
import type { CommentTab, Draft, PinPoint, ScreenshotHandler, ViewerMode } from "./types";

/** One celebration: the mascot's hop plus its rest beat. */
const CELEBRATION_MS = RESOLVED_HOP * 2 * 1000;

/** A comment that posted without its screenshot, once every try to add it failed. */
const POSTED_WITHOUT_SCREENSHOT = "Comment posted without its screenshot.";

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
  /** Where the mode last picked is remembered in this browser: the project, or a shared link. */
  modeScope: string;
  /** Why new comments are off, such as a shared link's closed review window. Reading still works. */
  commentLocked?: string;
  /** When this project is deleted (epoch ms); a notice shows under the top bar for its last 5 days. */
  expiresAt?: number;
  /** Draws the top bar's rule in `guest-accent`: a shared link's company color. */
  accentRule?: boolean;
  /**
   * A bar under the top bar, such as the owner's archived notice. A keyed motion element with
   * an exit: it enters and leaves in the same AnimatePresence as the deletion notice.
   */
  notice?: ReactNode;
}

type ScrollRequest = { id: string; target: "pin" | "card"; nonce: number } | null;

/**
 * Viewer layout and state: mode, breakpoint, surface, tab, selection, the open
 * pin popover, draft pin, and comment actions. Changes go through the viewer
 * backend (the owner's store or a shared link's server); on a shared link,
 * moderation controls are hidden. Website comments are pinned per breakpoint and
 * listed per breakpoint, or all together ("All breakpoints"); pin numbers stay
 * project-wide, so exports and shared links match.
 */
export function ViewerView({
  data,
  project,
  leading,
  actions,
  panelNotice,
  panelNote,
  draftStorage,
  modeScope,
  commentLocked,
  expiresAt,
  accentRule,
  notice,
}: ViewerViewProps) {
  const toast = useToast();
  const backend = useViewerBackend();
  const owner = backend.role === "owner";
  const access = useWorkspaceAccess();
  // The workspace's owner, not just its viewer (`owner` above): deletes anyone's comment.
  const moderator = owner && access !== null && can(access, "comment.moderate");
  const now = useNow();
  const reduce = useReducedMotion();
  const docked = !useMediaQuery("(min-width: 1024px)");
  const [draft, setDraft] = useViewerDraft(draftStorage);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const pages = useViewerPage(project, draft?.pageId ?? null, () => canvasAreaRef.current);
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [breakpointScope, setBreakpointScope] = useState<BreakpointScope>("breakpoint");
  const { source } = project;
  const website = source.kind === "url";
  const locked = Boolean(commentLocked);
  const frame = useFrameCheck(website ? source.url : null);
  const [remembered] = useState(() => rememberedMode(modeScope));
  const view = useViewerSurface(project, data, pages, {
    mode: openingMode({
      website,
      draft: Boolean(draft),
      locked,
      remembered,
      frame: frame.state,
    }),
    snapshotId: draft?.snapshotId ?? null,
  });
  const [tab, setTab] = useState<CommentTab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The pin whose comment popover is open. */
  const [openId, setOpenId] = useState<string | null>(null);
  // Another page swaps the stage, so it closes an open popover, as mode and breakpoint do.
  const [shownPageId, setShownPageId] = useState(pages.page?.id);
  if (shownPageId !== pages.page?.id) {
    setShownPageId(pages.page?.id);
    setOpenId(null);
  }
  const popoverId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest>(null);
  /** Bumped whenever an image surface finishes loading, so pins drawn on it can be found. */
  const [stageVersion, setStageVersion] = useState(0);
  const [celebrating, celebrate] = useTimedFlag(CELEBRATION_MS);
  const deleting = useDialogState<Comment>();
  const moderating = useDialogState<Comment>();
  /** The comment whose browser details are open (Get info, the team's). */
  const inspecting = useDialogState<Comment>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const exportMenuRef = useRef<MenuHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const handledScroll = useRef(0);
  const focusCanvasPending = useRef(false);

  const { mode, surface, breakpoint, snapshots, latestOf } = view;
  // Screen readers heard the frame check start ("Checking whether…"), so they hear how it ended
  // when it put the viewer in Comment mode: the toggle changed on its own and focus stays put.
  // Decided at that moment only, so a mode picked during the wait (or later) says nothing.
  const [wasDecided, setWasDecided] = useState(view.modeDecided);
  const [openedOnSnapshot, setOpenedOnSnapshot] = useState(false);
  if (!wasDecided && view.modeDecided) {
    setWasDecided(true);
    setOpenedOnSnapshot(
      mode === "comment" &&
        frame.state.status === "done" &&
        frame.state.result.verdict === "blocked",
    );
  }
  const stageKey = surfaceKey(surface);
  const comments = useMemo(() => commentsFor(data, project.id), [data, project.id]);
  const numbers = useMemo(() => pinNumbers(comments), [comments]);
  const severalPages = pages.total > 1;
  const pageId = pages.page?.id;
  /** A website's comments at the current breakpoint: the only ones it can pin. */
  const onBreakpoint = useMemo(
    () => (website ? commentsAtBreakpoint(comments, snapshots, breakpoint) : comments),
    [website, comments, snapshots, breakpoint],
  );
  // "All breakpoints" is offered once comments sit at two of them, so it stays put as the
  // breakpoint changes (as "All pages" does on page projects).
  const severalBreakpoints = useMemo(
    () => website && spansBreakpoints(comments, snapshots),
    [website, comments, snapshots],
  );
  const allBreakpoints = severalBreakpoints && breakpointScope === "all";
  /**
   * On websites the comments at the current breakpoint, or all of them ("All breakpoints");
   * on page projects all of them, or those on the page shown ("This page").
   */
  const listed = useMemo(() => {
    if (website) return allBreakpoints ? comments : onBreakpoint;
    return severalPages && pageScope === "page"
      ? comments.filter((comment) => comment.pageId === pageId)
      : comments;
  }, [website, allBreakpoints, comments, onBreakpoint, severalPages, pageScope, pageId]);
  /** Each listed comment's breakpoint, while the list shows them all: cards name it. */
  const listedBreakpoints = useMemo(
    () =>
      allBreakpoints
        ? new Map(comments.map((comment) => [comment.id, breakpointOfComment(comment, snapshots)]))
        : undefined,
    [allBreakpoints, comments, snapshots],
  );
  const perPage = useMemo(() => pageCounts(data, project), [data, project]);
  const pageNumbers = useMemo(
    () =>
      severalPages
        ? new Map(pagesOf(project).map((page, index) => [page.id, index + 1]))
        : undefined,
    [severalPages, project],
  );
  // Not `listed`: with "All breakpoints", Desktop's frame-anchored pins would land on a narrower frame.
  const onStage = (website ? onBreakpoint : listed).filter(
    (comment) => commentSurfaceKey(comment) === stageKey,
  );
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
  /** Pins in surface px, so each card's thumbnail can centre on its own. */
  const cropPins = useMemo(() => {
    const projectPages = pagesOf(project);
    return new Map(
      comments.map((comment) => [comment.id, pinInSurface(comment, snapshots, projectPages)]),
    );
  }, [comments, snapshots, project]);
  const counts = countComments(comments);
  const listedCounts = countComments(listed);
  const breakpointCounts = useMemo(
    () => activeByBreakpoint(comments, snapshots),
    [comments, snapshots],
  );
  const originalUrl = source.kind === "url" ? source.url : (source.referenceUrl ?? null);
  const stageDraft = draft?.surfaceKey === stageKey ? draft : null;
  /** The surface on stage now, for a send's retries to check (`onSurface`). */
  const stageKeyRef = useRef(stageKey);
  useEffect(() => {
    stageKeyRef.current = stageKey;
  }, [stageKey]);
  const deletion = expiresAt === undefined ? null : deletionWhen(expiresAt, now);
  // The owner's notice offers Export (the top bar's menu, so formats and progress stay in one place).
  const canExport = owner && comments.length > 0;

  /** Mode and breakpoint changes swap the stage, so they close an open popover. */
  const setMode = (next: ViewerMode) => {
    setOpenId(null);
    view.setMode(next);
  };
  /**
   * A mode picked by the person (toolbar, C, Escape, Browse buttons), remembered for next
   * time; a mode the viewer opened in or was put in isn't. Entering Comment focuses the
   * canvas, even when picked before the opening mode was known.
   */
  const chooseMode = (next: ViewerMode) => {
    if (next !== mode) focusCanvasPending.current = next === "comment";
    setMode(next);
    rememberMode(modeScope, next);
  };
  const setBreakpoint = (next: Breakpoint) => {
    setOpenId(null);
    view.setBreakpoint(next);
  };
  const changeTab = (next: CommentTab) => {
    if (next !== tab) setOpenId(null);
    setTab(next);
  };

  // Locking ends Comment mode, unless a draft is open: its text stays on screen to copy.
  const [wasLocked, setWasLocked] = useState(locked);
  if (wasLocked !== locked) {
    setWasLocked(locked);
    if (locked && !draft) setMode("browse");
  }

  useShortcut("c", () => chooseMode(mode === "comment" ? "browse" : "comment"), !locked);
  // The open popover takes Escape first.
  useShortcut(
    "escape",
    () => chooseMode("browse"),
    mode === "comment" && !stageDraft && !openComment,
  );

  /** After the composer closes, keyboard users carry on from the canvas instead of the page top. */
  const returnFocusToCanvas = () => overlayRef.current?.focus({ preventScroll: true });

  // Entering Comment mode (toolbar or C) puts focus on the canvas, so the arrow keys and
  // Enter place a pin right away. A snapshot may still be loading, so this waits for it.
  // The mode the viewer opens in leaves focus where the page puts it (a remembered Comment,
  // a site that refuses framing), unless it reopened a draft; one picked meanwhile is
  // `chooseMode`'s to focus.
  const [openedOnDraft] = useState(Boolean(draft));
  /** The mode this effect last acted on; null until the opening mode is known. */
  const focusedFor = useRef<ViewerMode | null>(null);
  useEffect(() => {
    if (!view.modeDecided) return;
    const previous = focusedFor.current;
    focusedFor.current = mode;
    // Unchanged (an effect run twice in development) or the opening mode: nothing to do.
    if (previous === mode || (previous === null && !openedOnDraft)) return;
    focusCanvasPending.current = mode === "comment";
  }, [mode, view.modeDecided, openedOnDraft]);
  useEffect(() => {
    if (!focusCanvasPending.current || !overlayRef.current) return;
    focusCanvasPending.current = false;
    overlayRef.current.focus({ preventScroll: true });
  }, [mode, stageVersion]);

  // Another page starts at its top, not wherever the last one was scrolled to. Declared
  // before the effect below, so a card that switches pages still scrolls to its pin.
  useEffect(() => {
    canvasAreaRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pageId]);

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
    if (locked) return;
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

  /** Reads what's on screen now; null when the stage's image isn't there to read. */
  const cropFor = (point: PinPoint): PendingCrop | null => {
    const image = imageRef.current;
    const area = canvasAreaRef.current;
    if (!image || !area) return null;
    const plan = planCommentCrop(image, area, point);
    if (!plan) return null;
    // Crops are cut in image px; the stored rect is in page px (they differ on a scaled-down snapshot).
    const scale = surface.kind === "snapshot" ? (surface.snapshot?.scale ?? 1) : 1;
    return { blob: renderCrop(image, plan), rect: toPagePx(plan.rect, scale) };
  };

  /**
   * Posts the draft, its screenshot first (`sendDraft`). The composer stays
   * open with its text until the comment is saved; a failure shows inline with
   * Retry, and the pin is marked unsent.
   */
  const submitDraft = async (body: string, author: string) => {
    if (!draft || draft.sending) return;
    if (author.trim() !== data.authorName) backend.setAuthorName(author);
    const { commentId, x, y, snapshotId, pageId, surfaceKey: draftSurface } = draft;
    const update = (change: Partial<Draft>) =>
      setDraft((current) =>
        current?.commentId === commentId ? { ...current, ...change } : current,
      );
    setDraft({ ...draft, body, sending: "posting", error: null });
    const takeCrop =
      surface.kind === "frame"
        ? null
        : onSurface(
            () => cropFor({ x, y }),
            () => stageKeyRef.current === draftSurface,
          );
    // The browser as it is when Post is pressed; read while the screenshot is prepared.
    const browser = captureClientInfo();
    const { result, crop } = await sendDraft({
      crop: draft.crop,
      takeCrop,
      onCropRetry: () => update({ sending: "screenshot" }),
      post: async (ready) => {
        update({ sending: "posting" });
        const clientInfo = await browser;
        return backend.addComment(
          {
            id: commentId,
            projectId: project.id,
            x,
            y,
            body,
            author,
            ...(snapshotId ? { snapshotId } : {}),
            ...(pageId ? { pageId } : {}),
            ...(clientInfo ? { clientInfo } : {}),
          },
          ready,
        );
      },
    });
    if (!result.ok) {
      update({ sending: false, error: result.error, crop });
      return;
    }
    setDraft((current) => (current?.commentId === commentId ? null : current));
    setTab("active");
    setSelectedId(result.value.id);
    returnFocusToCanvas();
    // Posted without its screenshot (every try failed): said here, since the card's mark may be
    // out of sight (a phone's closed comments sheet) and the composer that was busy is gone. On a
    // review link, its answer says so; for the owner, it's when one was wanted and none rendered.
    const withoutScreenshot = owner
      ? takeCrop !== null && crop === null
      : result.value.screenshotPending === true;
    if (withoutScreenshot) toast({ message: POSTED_WITHOUT_SCREENSHOT });
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

  /** Someone else's comment asks first and has no Undo (`commentRights`); the rest have Undo. */
  const askToDelete = (comment: Comment) => {
    if (commentRights(comment, { team: owner, moderator }).delete === "confirm") {
      moderating.show(comment);
    } else deleting.show(comment);
  };

  /**
   * After someone else's comment is deleted, focus goes to the card after it
   * on this tab, else the one before, else the panel's heading: never the page.
   */
  const focusAfterRemoval = (removed: Comment) => {
    const shown = listed.filter((comment) => comment.status === tab);
    const at = shown.findIndex((comment) => comment.id === removed.id);
    const neighbour = shown[at + 1] ?? shown[at - 1];
    forget(removed.id);
    setOpenId((current) => (current === removed.id ? null : current));
    // Two frames: after the dialog has handed focus back to the card that's leaving.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = neighbour
          ? document.querySelector<HTMLElement>(
              `[data-comment-id="${CSS.escape(neighbour.id)}"] [data-card-select]`,
            )
          : null;
        const heading = document.querySelector<HTMLElement>('[data-testid="comments-panel"] h2');
        if (card) card.focus();
        else if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        }
      }),
    );
  };

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
      onGetInfo={owner ? () => inspecting.show(openComment) : undefined}
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
      onExitComment={() => chooseMode("browse")}
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
  // below it rather than under it (WCAG 2.4.11). A failure or partial-page notice under the
  // bar sticks with it, up to three lines on a phone, so the inset grows while one shows.
  const lastCapture = view.capture.state;
  const barNotice =
    lastCapture.status === "failed" || (lastCapture.status === "idle" && lastCapture.partial);
  const scrollInset =
    surface.kind !== "snapshot" ? "" : barNotice ? "scroll-pt-40" : "scroll-pt-28";

  /** How many comments the list holds, for the scope filters' live region. */
  const listedSummary = listed.length === 1 ? "1 comment" : `${listed.length} comments`;

  const commentsBody = (
    <CommentsBody
      comments={listed}
      numbers={numbers}
      placements={placements}
      tab={tab}
      selectedId={selectedId}
      now={now}
      listRef={listRef}
      // With comments at another breakpoint (or page) left out, an empty list names this one.
      // "All breakpoints" leaves none out, so it gets the unscoped copy.
      scope={
        comments.length > listed.length
          ? website
            ? BREAKPOINT_LABEL[breakpoint]
            : `page ${pages.number}`
          : undefined
      }
      pageNumbers={pageNumbers}
      breakpoints={listedBreakpoints}
      cropPins={cropPins}
      canModerate={owner}
      moderator={moderator}
      reviewOpen={!locked}
      onSelect={(id) => select(id, "card")}
      onEdit={commentActions.edit}
      onResolve={commentActions.resolve}
      onReopen={commentActions.reopen}
      onDelete={askToDelete}
      onGetInfo={owner ? inspecting.show : undefined}
    />
  );

  return (
    <div className={`flex h-dvh flex-col gap-3 p-3 sm:gap-4 sm:p-4 ${sheetSpace}`}>
      <ViewerTopBar
        project={project}
        leading={leading}
        status={deriveStatus(counts)}
        mode={view.modeDecided ? mode : null}
        onMode={chooseMode}
        commentLocked={commentLocked}
        accentRule={accentRule}
        titleFirst={!owner}
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
            <ExportMenu
              data={data}
              project={project}
              commentCount={comments.length}
              handle={exportMenuRef}
            />
            {actions}
          </>
        }
      />
      {/* Empty until then, so the sentence is announced when it arrives (and only once). */}
      <p role="status" className="sr-only">
        {openedOnSnapshot
          ? "This site can't be shown here, so it opened on a snapshot in Comment mode."
          : ""}
      </p>
      <AnimatePresence>
        {notice}
        {deletion ? (
          <DeletionNotice
            key="deletion-notice"
            when={deletion}
            explanation={
              !owner
                ? DELETION_EXPLANATION.client
                : canExport
                  ? DELETION_EXPLANATION.owner
                  : DELETION_EXPLANATION.ownerEmpty
            }
            onExport={canExport ? (opener) => exportMenuRef.current?.open(opener) : undefined}
          />
        ) : null}
      </AnimatePresence>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {severalPages ? (
            <PageStrip
              pages={pagesOf(project)}
              number={pages.number}
              counts={perPage}
              onSelect={pages.selectPage}
              onStep={pages.step}
            />
          ) : null}
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
              frame={frame}
              overlay={overlay}
              imageRef={imageRef}
              onReady={() => setStageVersion((value) => value + 1)}
              capture={view.capture.state}
              onCapture={view.capture.capture}
              frameWidth={website && breakpoint !== "desktop" ? BREAKPOINT_WIDTH[breakpoint] : null}
              onShowLatest={view.showLatest}
              onBrowse={() => chooseMode("browse")}
              onScreenshot={owner ? saveScreenshot : null}
            />
          </main>
        </div>
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
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {panelNotice && !docked ? panelNotice : null}
            {severalPages ? (
              <PageFilter value={pageScope} onChange={setPageScope} number={pages.number} />
            ) : null}
            {severalBreakpoints ? (
              <BreakpointFilter
                value={breakpointScope}
                onChange={setBreakpointScope}
                breakpoint={breakpoint}
              />
            ) : null}
            {/*
             * Like "n projects shown" on folder pages: what "This page", or the one breakpoint,
             * leaves in the list. The "All" options leave nothing out, so they stay quiet.
             */}
            <p aria-live="polite" className="sr-only">
              {severalPages && pageScope === "page"
                ? `${listedSummary} on page ${pages.number}`
                : severalBreakpoints && breakpointScope === "breakpoint"
                  ? `${listedSummary} on ${BREAKPOINT_LABEL[breakpoint]}`
                  : ""}
            </p>
            {commentsBody}
          </div>
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
      <GetInfoDialog
        open={inspecting.open}
        comment={inspecting.payload}
        number={inspecting.payload ? (numbers.get(inspecting.payload.id) ?? 0) : 0}
        onClose={inspecting.close}
      />
      <DeleteOthersCommentDialog
        open={moderating.open}
        comment={moderating.payload}
        ownerName={access?.ownerName ?? null}
        onClose={moderating.close}
        onDeleted={focusAfterRemoval}
        toast={toast}
      />
    </div>
  );
}
