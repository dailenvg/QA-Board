import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { pageBlobKey } from "../share/keys";
import type {
  ClientComment,
  ClientReply,
  ClientView,
  SharedComment,
  SharedSnapshot,
  SharedSource,
} from "../share/types";
import type { Comment, Project, ProjectSource, Reply, Snapshot, SquintData } from "../store/types";
import type { EditKeyMemory } from "./edit-keys";
import type { ReviewerNameMemory } from "./reviewer-name";

/** The single project a shared link shows, under a fixed local id. */
export const SHARED_PROJECT_ID = "shared";

export interface ClientState {
  view: ClientView;
  authorName: string | null;
  /** The link stopped working while open (revoked, or paused). */
  gone: boolean;
  /** The link is paused, not gone: its workspace was suspended while it was open. */
  paused: boolean;
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
  /**
   * The comments this browser posted and holds an edit key for (4.12): its
   * own, which it may edit while they're active. Empty until read from
   * storage after the first render, so the server's render matches.
   */
  ownComments: ReadonlySet<string>;
}

export interface ClientStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ClientState;
  /** The state the server rendered with (the link's remembered name included), for hydration. */
  getServerSnapshot: () => ClientState;
  /** The server's latest view; a new review deadline (the owner changed the window) reopens it. */
  setView: (view: ClientView) => void;
  /**
   * A comment the server accepted (ignored if a refresh already brought it),
   * with the key that lets this browser edit it, when the answer carried one.
   */
  addComment: (comment: ClientComment, editKey?: string) => void;
  /** A comment the server changed (the client's own edit), in place; ignored when it's gone. */
  replaceComment: (comment: SharedComment) => void;
  /** Reads which comments are this browser's own (`ownComments`) from storage. */
  loadOwnComments: () => void;
  /** The edit key this browser holds for a comment, or null. */
  editKeyOf: (commentId: string) => string | null;
  addSnapshot: (snapshot: SharedSnapshot) => void;
  setAuthorName: (name: string) => void;
  /** Without a name for this link, takes the one this browser kept for every link before. */
  carryOverAuthorName: () => void;
  /** The link stopped working; `paused` when the server said so (404 `paused`). */
  markGone: (paused?: boolean) => void;
  markReviewClosed: () => void;
  markLocked: () => void;
}

interface ClientStoreOptions {
  /** The name remembered for this link, as the server read it from the link's cookie. */
  authorName: string | null;
  names: ReviewerNameMemory;
  /** The link's edit keys in this browser; none kept without it. */
  editKeys?: EditKeyMemory;
}

/** Keeps no keys: a store without `editKeys` has no comments of its own. */
const NO_EDIT_KEYS: EditKeyMemory = { ids: () => [], keyOf: () => null, save: () => {} };

export function createClientStore(
  initial: ClientView,
  { authorName, names, editKeys = NO_EDIT_KEYS }: ClientStoreOptions,
): ClientStore {
  const rendered: ClientState = {
    view: initial,
    authorName,
    gone: false,
    paused: false,
    reviewClosed: false,
    locked: false,
    ownComments: new Set(),
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
    addComment(comment, editKey) {
      if (editKey) editKeys.save(comment.id, editKey);
      // Only once the key is really kept: with storage blocked, Edit would show and then
      // refuse every save, so the comment stays read-only, as 4b.16 says.
      const kept = editKey !== undefined && editKeys.keyOf(comment.id) === editKey;
      const own = kept ? new Set([...state.ownComments, comment.id]) : state.ownComments;
      if (state.view.comments.some((entry) => entry.id === comment.id)) {
        if (own !== state.ownComments) set({ ownComments: own });
        return;
      }
      set({
        view: { ...state.view, comments: [...state.view.comments, comment] },
        ownComments: own,
      });
    },
    replaceComment(comment) {
      const comments = state.view.comments.map((entry) =>
        entry.id === comment.id ? { ...entry, ...comment } : entry,
      );
      set({ view: { ...state.view, comments } });
    },
    loadOwnComments: () => set({ ownComments: new Set(editKeys.ids()) }),
    editKeyOf: (commentId) => editKeys.keyOf(commentId),
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
    markGone: (paused = false) => set({ gone: true, paused }),
    markReviewClosed: () => set({ reviewClosed: true }),
    markLocked: () => set({ locked: true }),
  };
}

/** A shared comment in the viewer's shape: `mine` when this browser posted it (`ownComments`). */
function toComment(comment: ClientComment, own: ReadonlySet<string>): Comment {
  const { crop, ...rest } = comment;
  return {
    ...rest,
    projectId: SHARED_PROJECT_ID,
    ...(crop ? { crop: { blobKey: cropBlobKey(comment.id), rect: crop.rect } } : {}),
    ...(own.has(comment.id) ? { mine: true as const } : {}),
  };
}

/** A shared reply in the viewer's shape, read-only: guests don't reply yet. */
function toReply(reply: ClientReply): Reply {
  return { ...reply, projectId: SHARED_PROJECT_ID };
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

/** The shared project in the viewer's shape: one project, its snapshots, comments and replies. */
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
      comments: view.comments.map((comment) => toComment(comment, state.ownComments)),
      snapshots: view.snapshots.map(toSnapshot),
      replies: view.replies.map(toReply),
      authorName: state.authorName,
    },
  };
}
