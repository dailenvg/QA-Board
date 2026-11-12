import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { pageBlobKey } from "../share/keys";
import type { ClientView, SharedComment, SharedSnapshot, SharedSource } from "../share/types";
import type { Comment, Project, ProjectSource, Snapshot, SquintData } from "../store/types";
import type { ReviewerNameMemory } from "./reviewer-name";

/** The single project a shared link shows, under a fixed local id. */
export const SHARED_PROJECT_ID = "shared";

export interface ClientState {
  view: ClientView;
  authorName: string | null;
  /** The link stopped working while open (revoked). */
  gone: boolean;
  /**
   * The server refused an addition because the review window is over (whatever
   * this clock says), until a refresh brings a new deadline.
   */
  reviewClosed: boolean;
  /**
   * The link asked for its password again while open (it was changed, or the
   * guest pass ran out): the review gives way to the password screen.
   */
  locked: boolean;
}

export interface ClientStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ClientState;
  /** The state the server rendered with (the link's remembered name included), for hydration. */
  getServerSnapshot: () => ClientState;
  /** The server's latest view; a new review deadline (the owner changed the window) reopens it. */
  setView: (view: ClientView) => void;
  /** A comment the server accepted (ignored if a refresh already brought it). */
  addComment: (comment: SharedComment) => void;
  addSnapshot: (snapshot: SharedSnapshot) => void;
  setAuthorName: (name: string) => void;
  /** Without a name for this link, takes the one this browser kept for every link before. */
  carryOverAuthorName: () => void;
  markGone: () => void;
  markReviewClosed: () => void;
  markLocked: () => void;
}

interface ClientStoreOptions {
  /** The name remembered for this link, as the server read it from the link's cookie. */
  authorName: string | null;
  names: ReviewerNameMemory;
}

export function createClientStore(
  initial: ClientView,
  { authorName, names }: ClientStoreOptions,
): ClientStore {
  const rendered: ClientState = {
    view: initial,
    authorName,
    gone: false,
    reviewClosed: false,
    locked: false,
  };
  let state = rendered;
  const listeners = new Set<() => void>();
  const set = (change: Partial<ClientState>) => {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    getServerSnapshot: () => rendered,
    setView: (view) =>
      set(view.reviewEndsAt === state.view.reviewEndsAt ? { view } : { view, reviewClosed: false }),
    addComment(comment) {
      if (state.view.comments.some((entry) => entry.id === comment.id)) return;
      set({ view: { ...state.view, comments: [...state.view.comments, comment] } });
    },
    addSnapshot: (snapshot) =>
      set({ view: { ...state.view, snapshots: [...state.view.snapshots, snapshot] } }),
    setAuthorName(name) {
      names.save(name);
      set({ authorName: name });
    },
    carryOverAuthorName() {
      if (state.authorName) return;
      const name = names.carryOver();
      if (name) set({ authorName: name });
    },
    markGone: () => set({ gone: true }),
    markReviewClosed: () => set({ reviewClosed: true }),
    markLocked: () => set({ locked: true }),
  };
}

function toComment(comment: SharedComment): Comment {
  const { crop, ...rest } = comment;
  return {
    ...rest,
    projectId: SHARED_PROJECT_ID,
    ...(crop ? { crop: { blobKey: cropBlobKey(comment.id), rect: crop.rect } } : {}),
  };
}

function toSnapshot(snapshot: SharedSnapshot): Snapshot {
  return { ...snapshot, projectId: SHARED_PROJECT_ID, blobKey: snapshotBlobKey(snapshot.id) };
}

/** A shared source as the viewer reads it: each page's picture is read through its share key. */
function toSource(source: SharedSource): ProjectSource {
  if (source.kind === "url") return source;
  return {
    ...source,
    pages: source.pages.map((page) => ({ ...page, blobKey: pageBlobKey(page.id, page.rev) })),
  };
}

/** The shared project in the viewer's shape: one project, its snapshots and comments. */
export function toViewerData(state: ClientState): { data: SquintData; project: Project } {
  const { view } = state;
  const project: Project = {
    id: SHARED_PROJECT_ID,
    folderId: SHARED_PROJECT_ID,
    name: view.project.name,
    source: toSource(view.project.source),
    createdAt: 0,
    updatedAt: 0,
  };
  return {
    project,
    data: {
      version: 3,
      folders: [],
      projects: [project],
      comments: view.comments.map(toComment),
      snapshots: view.snapshots.map(toSnapshot),
      authorName: state.authorName,
    },
  };
}
