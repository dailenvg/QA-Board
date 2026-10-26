import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { pageBlobKey } from "../share/keys";
import type { ClientView, SharedComment, SharedSnapshot, SharedSource } from "../share/types";
import type { Comment, Project, ProjectSource, Snapshot, SquintData } from "../store/types";

/** The single project a shared link shows, under a fixed local id. */
export const SHARED_PROJECT_ID = "shared";

export interface ClientState {
  view: ClientView;
  authorName: string | null;
  /** The link stopped working while open (revoked). */
  gone: boolean;
  /** The server refused an addition because the review window is over (whatever this clock says). */
  reviewClosed: boolean;
}

export interface ClientStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ClientState;
  /** The state the server rendered with (no remembered name), for hydration. */
  getServerSnapshot: () => ClientState;
  setView: (view: ClientView) => void;
  /** A comment the server accepted (ignored if a refresh already brought it). */
  addComment: (comment: SharedComment) => void;
  addSnapshot: (snapshot: SharedSnapshot) => void;
  setAuthorName: (name: string) => void;
  markGone: () => void;
  markReviewClosed: () => void;
}

/** A reviewer's name, remembered in this browser apart from any Squint workspace. */
const NAME_KEY = "squint:reviewer-name";

function readName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function createClientStore(initial: ClientView): ClientStore {
  const rendered: ClientState = {
    view: initial,
    authorName: null,
    gone: false,
    reviewClosed: false,
  };
  let state = rendered;
  let nameRead = false;
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
    getSnapshot() {
      if (!nameRead && typeof window !== "undefined") {
        nameRead = true;
        state = { ...state, authorName: readName() };
      }
      return state;
    },
    getServerSnapshot: () => rendered,
    setView: (view) => set({ view }),
    addComment(comment) {
      if (state.view.comments.some((entry) => entry.id === comment.id)) return;
      set({ view: { ...state.view, comments: [...state.view.comments, comment] } });
    },
    addSnapshot: (snapshot) =>
      set({ view: { ...state.view, snapshots: [...state.view.snapshots, snapshot] } }),
    setAuthorName(name) {
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        // Not remembered; asked again next visit.
      }
      set({ authorName: name });
    },
    markGone: () => set({ gone: true }),
    markReviewClosed: () => set({ reviewClosed: true }),
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
      revocations: [],
      authorName: state.authorName,
    },
  };
}
