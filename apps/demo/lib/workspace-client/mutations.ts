import { sentPart } from "../client-info/schema";
import { windowChoice } from "../share/review-window";
import type { Action } from "../store/reducer";
import type { Comment, Reply, Snapshot, SquintData } from "../store/types";
import {
  CLIENT_COMMENT_GONE,
  notAllowedMessage,
  notAllowedPermission,
  restoreRefusedMessage,
  type AskContext,
} from "./permission-copy";

/**
 * What each store action asks of the workspace API (`/api/w/<id>/…`). The
 * store applies an action at once (optimistic); these requests then make the
 * server match, in order. Everything is derived from the state before and
 * after the action, so an action the reducer ignored sends nothing.
 */

export interface ServerWrite {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Below `/api/w/<workspaceId>`. */
  path: string;
  body: unknown;
  /** Answers that still mean done: a 404 on a delete, a 409 on a re-add. */
  tolerate?: readonly number[];
}

const PROJECT_GONE = "This project is no longer here. It may have been deleted in another tab.";
const FOLDER_GONE = "This folder is no longer here. It may have been deleted in another tab.";
const COMMENT_GONE = "This comment is no longer here. It may have been deleted in another tab.";
const REPLY_GONE = "This reply is no longer here. It may have been deleted in another tab.";
const LINK_GONE = "This share link is no longer here. It may have been revoked in another tab.";
export const SAVE_FAILED =
  "That change didn't save and was undone. Check your connection and try again.";

const segment = encodeURIComponent;
const folderPath = (id: string) => `/folders/${segment(id)}`;
const projectPath = (id: string) => `/projects/${segment(id)}`;
const commentsPath = (projectId: string) => `${projectPath(projectId)}/comments`;
const commentPath = (projectId: string, id: string) => `${commentsPath(projectId)}/${segment(id)}`;
const repliesPath = (reply: Pick<Reply, "projectId" | "commentId">) =>
  `${commentPath(reply.projectId, reply.commentId)}/replies`;
const replyPath = (reply: Pick<Reply, "projectId" | "commentId" | "id">) =>
  `${repliesPath(reply)}/${segment(reply.id)}`;
const snapshotsPath = (projectId: string) => `${projectPath(projectId)}/snapshots`;
const linkPath = (projectId: string) => `${projectPath(projectId)}/share-link`;

const write = (
  method: ServerWrite["method"],
  path: string,
  body: unknown = {},
  tolerate?: readonly number[],
): ServerWrite => ({ method, path, body, ...(tolerate ? { tolerate } : {}) });

/**
 * The comment as the API takes it: whose it is comes from the request (the
 * session, or `fromShare`), not the body, and so does the author's photo
 * (`authorAvatar`, `team`): only the server says those.
 */
function commentBody(comment: Comment) {
  const {
    projectId: _project,
    fromClient: _client,
    mine: _mine,
    authorAvatar: _avatar,
    team: _team,
    ...body
  } = comment;
  return body;
}

/**
 * A new comment: its browser details go without the user agent, which the
 * server reads from the request itself.
 */
function newCommentBody(comment: Comment) {
  const { clientInfo, ...body } = commentBody(comment);
  return clientInfo ? { ...body, clientInfo: sentPart(clientInfo) } : body;
}

/**
 * A guest's comment, saved as one (`fromShare`): the server reads its words
 * and browser details from the review link, so neither is sent.
 */
function guestCommentBody(comment: Comment) {
  const { clientInfo: _info, ...body } = commentBody(comment);
  return { ...body, fromShare: true };
}

/**
 * The reply as the API takes it: where it goes is in the path, and whose it
 * is and the author's photo come from the server, as for comments.
 */
function replyBody(reply: Reply) {
  const {
    projectId: _project,
    commentId: _comment,
    fromClient: _client,
    mine: _mine,
    authorAvatar: _avatar,
    team: _team,
    ...body
  } = reply;
  return body;
}

/**
 * A guest's reply, saved as one (`fromShare`): the server reads its words,
 * name, time and browser details from the review link, so only its id matters.
 */
function guestReplyBody(reply: Reply) {
  const { clientInfo: _info, editedAt: _edited, ...body } = replyBody(reply);
  return { ...body, fromShare: true };
}

/** A new reply: its browser details go without the user agent, which the server reads itself. */
function newReplyBody(reply: Reply) {
  const { clientInfo, ...body } = replyBody(reply);
  return clientInfo ? { ...body, clientInfo: sentPart(clientInfo) } : body;
}

function snapshotBody(snapshot: Snapshot) {
  const { projectId: _project, ...body } = snapshot;
  return body;
}

function added<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  const ids = new Set(before.map((entry) => entry.id));
  return after.filter((entry) => !ids.has(entry.id));
}

function removed<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  return added(after, before);
}

/** The project a comment belongs to, before the action (edits, deletes). */
function commentProject(data: SquintData, id: string): string | null {
  return data.comments.find((comment) => comment.id === id)?.projectId ?? null;
}

function commentWrite(
  data: SquintData,
  id: string,
  change: (projectId: string) => ServerWrite,
): ServerWrite[] {
  const projectId = commentProject(data, id);
  return projectId ? [change(projectId)] : [];
}

/**
 * Undoing a delete. The server makes whoever posts a comment its author, so
 * only the member's own goes back as a plain post (with `editedAt`, so it
 * still says it was edited). A client's goes back only as a client's, while
 * the guest's original is still on the review link (the server checks):
 * once it isn't, the 404 refuses the Undo rather than re-post the client's
 * words as the member's. The member's own keeps the browser details it was
 * posted with (`clientInfo`, user agent included), not this browser's.
 */
function restoreWrites(comment: Comment): ServerWrite[] {
  const path = commentsPath(comment.projectId);
  return comment.fromClient
    ? [write("POST", path, guestCommentBody(comment), [409])]
    : [write("POST", path, commentBody(comment), [409])];
}

/**
 * Undoing the delete of the member's own reply, or of a comment with only
 * their replies (D25): posted again as theirs, with when it was posted and
 * last edited (the server keeps `editedAt` between the two and now) and the
 * browser details recorded then.
 */
const restoreReplyWrite = (reply: Reply): ServerWrite =>
  write("POST", repliesPath(reply), replyBody(reply), [409]);

/** A reply change, sent where the reply was before the action; nothing for one that isn't there. */
function replyWrite(
  data: SquintData,
  id: string,
  change: (reply: Reply) => ServerWrite,
): ServerWrite[] {
  const reply = data.replies.find((entry) => entry.id === id);
  return reply ? [change(reply)] : [];
}

/** Replies the action put back: those in `after` that `before` didn't have. */
const restoredReplies = (before: SquintData, after: SquintData) =>
  added(before.replies, after.replies);

/** Comments whose client edited their words since `before` (4.12). */
function clientEdited(before: SquintData, after: SquintData): Comment[] {
  const was = new Map(before.comments.map((comment) => [comment.id, comment.editedAt]));
  return after.comments.filter(
    (comment) =>
      comment.fromClient && was.has(comment.id) && was.get(comment.id) !== comment.editedAt,
  );
}

/**
 * Client additions and edits a pull merged: their snapshots first, which
 * comments may sit on, and replies after the comments they answer. The
 * server reads what each guest's comment and reply says from the review link
 * itself, so an edit sends no words (and a comment the team deleted
 * meanwhile answers 404: nothing to bring back).
 */
function mergeWrites(before: SquintData, after: SquintData, projectId: string): ServerWrite[] {
  const share = after.projects.find((project) => project.id === projectId)?.share;
  if (!share) return [];
  return [
    ...added(before.snapshots, after.snapshots).map((snapshot) =>
      write("POST", snapshotsPath(projectId), snapshotBody(snapshot), [409]),
    ),
    // Guests' comments: saved without an author account (the server checks they're a guest's).
    ...added(before.comments, after.comments).map((comment) =>
      write("POST", commentsPath(projectId), guestCommentBody(comment), [409]),
    ),
    ...clientEdited(before, after).map((comment) =>
      write("POST", `${commentPath(projectId, comment.id)}/client-edit`, {}, [404]),
    ),
    // Guests' replies: saved without an author account (the server checks they're a guest's).
    // A comment the team deleted meanwhile answers 404, taking its thread: nothing to save.
    ...added(before.replies, after.replies).map((reply) =>
      write("POST", repliesPath(reply), guestReplyBody(reply), [404, 409]),
    ),
    write("PATCH", linkPath(projectId), {
      cursor: share.cursor,
      lastSyncedAt: share.lastSyncedAt ?? Date.now(),
    }),
  ];
}

/**
 * The requests that make the server match `after`. A folder delete trashes
 * the projects inside first (the server only deletes empty folders), so they
 * stay restorable for the trash's grace period.
 */
export function writesFor(action: Action, before: SquintData, after: SquintData): ServerWrite[] {
  switch (action.type) {
    case "folder/create": {
      const { id, name, parentId, createdAt } = action.folder;
      // A 409 is this very folder (ids are unique): made by a retry, or another tab filing.
      return [write("POST", "/folders", { id, name, parentId, createdAt }, [409])];
    }
    case "folder/rename":
      return [write("PATCH", folderPath(action.id), { name: action.name })];
    case "folder/move":
      return [write("PATCH", folderPath(action.id), { parentId: action.parentId })];
    case "folder/delete":
      return [
        ...removed(before.projects, after.projects).map((project) =>
          write("DELETE", projectPath(project.id), {}, [404]),
        ),
        write("DELETE", folderPath(action.id), {}, [404]),
      ];
    case "project/create": {
      const { id, folderId, name, source, createdAt } = action.project;
      return [write("POST", "/projects", { id, folderId, name, source, createdAt })];
    }
    case "project/rename":
      return [write("PATCH", projectPath(action.id), { name: action.name })];
    case "project/move":
      return [write("PATCH", projectPath(action.id), { folderId: action.folderId })];
    case "project/replace-source":
      return [write("PATCH", projectPath(action.id), { source: action.source })];
    case "project/delete":
      return [write("DELETE", projectPath(action.id), {}, [404])];
    case "project/abandon":
      return [write("POST", `${projectPath(action.id)}/abandon`)];
    case "project/archive":
      return [write("PUT", `${projectPath(action.id)}/archive`, { archived: action.archived })];
    case "project/label":
      return [write("PUT", `${projectPath(action.id)}/label`, { label: action.label })];
    case "project/restore":
      return [write("POST", `${projectPath(action.project.id)}/restore`)];
    case "comment/add":
      return [
        write("POST", commentsPath(action.comment.projectId), newCommentBody(action.comment)),
      ];
    case "comment/restore":
      return [
        ...restoreWrites(action.comment),
        ...restoredReplies(before, after).map(restoreReplyWrite),
      ];
    case "comment/edit":
      return commentWrite(before, action.id, (projectId) =>
        write("PATCH", commentPath(projectId, action.id), { body: action.body }),
      );
    case "comment/set-status":
      return commentWrite(before, action.id, (projectId) =>
        write("PATCH", commentPath(projectId, action.id), { status: action.status }),
      );
    case "comment/set-crop":
      return commentWrite(before, action.id, (projectId) =>
        write("PATCH", commentPath(projectId, action.id), { crop: action.crop }),
      );
    case "comment/delete":
      return commentWrite(before, action.id, (projectId) =>
        write("DELETE", commentPath(projectId, action.id), {}, [404]),
      );
    case "comment/removed":
      return [];
    case "reply/add":
      return [write("POST", repliesPath(action.reply), newReplyBody(action.reply))];
    case "reply/restore":
      return [restoreReplyWrite(action.reply)];
    case "reply/edit":
      return replyWrite(before, action.id, (reply) =>
        write("PATCH", replyPath(reply), { body: action.body }),
      );
    case "reply/delete":
      return replyWrite(before, action.id, (reply) => write("DELETE", replyPath(reply), {}, [404]));
    case "reply/removed":
      return [];
    case "snapshot/add":
      return [
        write("POST", snapshotsPath(action.snapshot.projectId), snapshotBody(action.snapshot)),
      ];
    case "snapshot/prune":
      return removed(before.snapshots, after.snapshots).map((snapshot) =>
        write("DELETE", `${snapshotsPath(snapshot.projectId)}/${segment(snapshot.id)}`, {}, [404]),
      );
    case "author/set":
      return [write("PUT", "/author", { name: action.name })];
    case "project/share": {
      const { id, token, ownerKey, reviewWindowHours } = action.share;
      const reviewWindow = windowChoice(reviewWindowHours);
      return [write("PUT", linkPath(action.id), { shareId: id, token, ownerKey, reviewWindow })];
    }
    case "share/window-restore":
    case "share/password":
    case "share/invited":
      return [];
    case "share/client":
      return [write("PATCH", `${linkPath(action.id)}/settings`, { clientName: action.clientName })];
    case "share/window":
      return [
        write("PATCH", `${linkPath(action.id)}/settings`, {
          reviewWindow: windowChoice(action.hours),
        }),
      ];
    case "project/unshare":
      return [write("DELETE", linkPath(action.id), {}, [404])];
    case "share/synced": {
      const share = after.projects.find((project) => project.id === action.id)?.share;
      return share
        ? [write("PATCH", linkPath(action.id), { cursor: share.cursor, lastSyncedAt: action.at })]
        : [];
    }
    case "share/merge":
      return mergeWrites(before, after, action.id);
  }
}

/** What to tell the person when a link's password didn't change (`status` 0: no answer). */
export function passwordRefusal(
  status: number,
  removing: boolean,
  body: unknown,
  context: AskContext,
): string {
  const permission = notAllowedPermission(status, body);
  if (permission) return notAllowedMessage(permission, context);
  if (status === 404) return LINK_GONE;
  if (status === 400) return "Use 8 to 128 characters.";
  return removing
    ? "The password wasn't removed. Check your connection and try again."
    : "The password didn't save. Check your connection and try again.";
}

/**
 * What to tell the person when the server refused `action` with `status` (0:
 * no answer) and `body`: for a switch the owner turned off since the page
 * loaded, which one, and who to ask.
 */
export function refusalMessage(
  action: Action,
  status: number,
  body: unknown,
  context: AskContext,
): string {
  const permission = notAllowedPermission(status, body);
  if (permission === "projects.trash" && action.type === "project/restore") {
    return restoreRefusedMessage(action.project.name);
  }
  if (permission) return notAllowedMessage(permission, context);
  if (action.type === "comment/restore" && action.comment.fromClient && status === 404) {
    return CLIENT_COMMENT_GONE;
  }
  const gone = status === 404 || status === 422;
  if (!gone) return SAVE_FAILED;
  if (action.type.startsWith("folder/")) return FOLDER_GONE;
  if (action.type === "project/create" || action.type === "project/move") {
    return status === 422 ? FOLDER_GONE : PROJECT_GONE;
  }
  if (action.type.startsWith("comment/") && action.type !== "comment/add") {
    return status === 404 ? COMMENT_GONE : SAVE_FAILED;
  }
  if (action.type === "reply/add" || action.type === "reply/restore") {
    return status === 404 ? COMMENT_GONE : SAVE_FAILED;
  }
  if (action.type.startsWith("reply/")) return status === 404 ? REPLY_GONE : SAVE_FAILED;
  if (action.type === "share/window" || action.type === "share/client") return LINK_GONE;
  return PROJECT_GONE;
}
