import type { Folder, PageOrigin, Project, ProjectSource, SquintData } from "../lib/store/types";
import { DEFAULT_FOLDER } from "./squint-fixtures";

const NOW = Date.now();

function folder(id: string, name: string, parentId: string | null, index: number): Folder {
  return { id, name, parentId, createdAt: NOW - 100 + index };
}

function pages(id: string, origin: PageOrigin, count: number, fileName: string): ProjectSource {
  return {
    kind: "pages",
    origin,
    fileName,
    pages: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index + 1}`,
      blobKey: `page:${id}-${index + 1}`,
      name: origin === "pdf" ? `Page ${index + 1}` : `${id}-${index + 1}.png`,
      width: 1600,
      height: 1000,
    })),
  };
}

function project(
  id: string,
  name: string,
  folderId: string,
  source: ProjectSource,
  index: number,
): Project {
  return { id, name, folderId, source, createdAt: NOW + index, updatedAt: NOW + index };
}

/**
 * My projects holds one project of each type; Client work › Q4 › Launch nests three deep.
 * Pictures aren't stored, so image cards show their missing-image placeholder.
 */
export const WORKSPACE_SEED: SquintData = {
  version: 3,
  folders: [
    folder(DEFAULT_FOLDER.id, DEFAULT_FOLDER.name, null, 0),
    folder("client", "Client work", null, 1),
    folder("q4", "Q4", "client", 2),
    folder("launch", "Launch", "q4", 3),
    folder("cafe", "Café menus", null, 4),
  ],
  projects: [
    project("site", "Homepage", DEFAULT_FOLDER.id, { kind: "url", url: "https://example.com/" }, 0),
    project("single", "Hero shot", DEFAULT_FOLDER.id, pages("single", "image", 1, "hero.png"), 1),
    project("combined", "Mockups", DEFAULT_FOLDER.id, pages("combined", "image", 3, "a.png"), 2),
    project("deck", "Pitch deck", DEFAULT_FOLDER.id, pages("deck", "pdf", 4, "pitch.pdf"), 3),
    project("nested", "Spring Campaign Banner", "launch", pages("nested", "image", 1, "b.png"), 4),
    project("resume", "Résumé review", "cafe", pages("resume", "image", 1, "cv.png"), 5),
  ],
  comments: [],
  snapshots: [],
  revocations: [],
  authorName: null,
};
