import type { Comment, CommentStatus, Folder, Project, ProjectSource, SquintData } from "./types";

export type Action =
  | { type: "folder/create"; folder: Folder }
  | { type: "folder/rename"; id: string; name: string }
  | { type: "folder/delete"; id: string }
  | { type: "project/create"; project: Project }
  | { type: "project/rename"; id: string; name: string; at: number }
  | { type: "project/move"; id: string; folderId: string; at: number }
  | { type: "project/replace-source"; id: string; source: ProjectSource; at: number }
  | { type: "project/delete"; id: string }
  /** Undo for a delete: puts the project and its comments back exactly as they were. */
  | { type: "project/restore"; project: Project; comments: Comment[] }
  | { type: "comment/add"; comment: Comment }
  /** Undo for a delete: puts the comment back with its original id, number and timestamps. */
  | { type: "comment/restore"; comment: Comment }
  | { type: "comment/edit"; id: string; body: string; at: number }
  | { type: "comment/set-status"; id: string; status: CommentStatus; at: number }
  | { type: "comment/delete"; id: string }
  | { type: "author/set"; name: string };

function touchProject(projects: Project[], id: string, at: number): Project[] {
  return projects.map((project) => (project.id === id ? { ...project, updatedAt: at } : project));
}

function updateComment(
  data: SquintData,
  id: string,
  at: number,
  change: (comment: Comment) => Comment,
): SquintData {
  const target = data.comments.find((comment) => comment.id === id);
  if (!target) return data;
  return {
    ...data,
    comments: data.comments.map((comment) => (comment.id === id ? change(comment) : comment)),
    projects: touchProject(data.projects, target.projectId, at),
  };
}

/** Pure state transitions. Unknown ids are no-ops, so stale UI can never corrupt data. */
export function reduce(data: SquintData, action: Action): SquintData {
  switch (action.type) {
    case "folder/create":
      return { ...data, folders: [...data.folders, action.folder] };
    case "folder/rename":
      return {
        ...data,
        folders: data.folders.map((folder) =>
          folder.id === action.id ? { ...folder, name: action.name } : folder,
        ),
      };
    case "folder/delete": {
      // Every project needs a folder, so the last folder stays.
      if (data.folders.length <= 1) return data;
      const removed = new Set(
        data.projects.filter((project) => project.folderId === action.id).map((p) => p.id),
      );
      return {
        ...data,
        folders: data.folders.filter((folder) => folder.id !== action.id),
        projects: data.projects.filter((project) => !removed.has(project.id)),
        comments: data.comments.filter((comment) => !removed.has(comment.projectId)),
      };
    }
    case "project/create":
      if (!data.folders.some((folder) => folder.id === action.project.folderId)) return data;
      return { ...data, projects: [...data.projects, action.project] };
    case "project/rename":
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id
            ? { ...project, name: action.name, updatedAt: action.at }
            : project,
        ),
      };
    case "project/move":
      if (!data.folders.some((folder) => folder.id === action.folderId)) return data;
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id
            ? { ...project, folderId: action.folderId, updatedAt: action.at }
            : project,
        ),
      };
    case "project/replace-source":
      return {
        ...data,
        projects: data.projects.map((project) =>
          project.id === action.id
            ? { ...project, source: action.source, updatedAt: action.at }
            : project,
        ),
      };
    case "project/delete":
      return {
        ...data,
        projects: data.projects.filter((project) => project.id !== action.id),
        comments: data.comments.filter((comment) => comment.projectId !== action.id),
      };
    case "project/restore":
      if (data.projects.some((project) => project.id === action.project.id)) return data;
      if (!data.folders.some((folder) => folder.id === action.project.folderId)) return data;
      return {
        ...data,
        projects: [...data.projects, action.project],
        comments: [...data.comments, ...action.comments],
      };
    case "comment/restore":
      if (data.comments.some((comment) => comment.id === action.comment.id)) return data;
      if (!data.projects.some((project) => project.id === action.comment.projectId)) return data;
      return { ...data, comments: [...data.comments, action.comment] };
    case "comment/add":
      if (!data.projects.some((project) => project.id === action.comment.projectId)) return data;
      return {
        ...data,
        comments: [...data.comments, action.comment],
        projects: touchProject(data.projects, action.comment.projectId, action.comment.createdAt),
      };
    case "comment/edit":
      return updateComment(data, action.id, action.at, (comment) => ({
        ...comment,
        body: action.body,
        updatedAt: action.at,
      }));
    case "comment/set-status":
      return updateComment(data, action.id, action.at, (comment) => {
        const { resolvedAt: _previous, ...rest } = comment;
        return action.status === "resolved"
          ? { ...rest, status: "resolved", resolvedAt: action.at }
          : { ...rest, status: "active" };
      });
    case "comment/delete":
      return { ...data, comments: data.comments.filter((comment) => comment.id !== action.id) };
    case "author/set":
      return { ...data, authorName: action.name };
  }
}
