export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export type ProjectSource =
  | { kind: "url"; url: string }
  /** `referenceUrl` keeps the original site when a screenshot replaced an unembeddable URL. */
  | { kind: "image"; dataUrl: string; fileName: string; referenceUrl?: string };

export interface Project {
  id: string;
  folderId: string;
  name: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
}

export type CommentStatus = "active" | "resolved";

export interface Comment {
  id: string;
  projectId: string;
  /** Pin position as a percentage (0 to 100) of the preview canvas. */
  x: number;
  y: number;
  body: string;
  author: string;
  status: CommentStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface SquintData {
  version: 1;
  folders: Folder[];
  projects: Project[];
  comments: Comment[];
  /** Name used for new comments; asked once, then remembered. */
  authorName: string | null;
}
