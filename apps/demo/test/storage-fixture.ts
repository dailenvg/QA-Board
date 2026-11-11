import type { Database } from "@/lib/db/database";
import type { Queryable } from "@/lib/share/migrate";
import { createProject, setArchived, trashProject } from "@/lib/workspace/projects";
import type { ProjectCreate } from "@/lib/workspace/schemas";
import { addFolder, NOW, PAGES_PROJECT, URL_PROJECT } from "./workspace-fixture";

/** A file row of `size` bytes at `path` (kept inline: no store needed). */
export async function addBlob(
  db: Queryable,
  workspaceId: string,
  path: string,
  size: number,
  { projectId = null, type = "image/png" }: { projectId?: string | null; type?: string } = {},
) {
  await db.query(
    `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [workspaceId, path, projectId, type, size, new Uint8Array([0])],
  );
}

/** A project file's row: `kind` as in its path (`page`, `snapshot`, `crop`...). */
export function addProjectBlob(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  kind: string,
  id: string,
  size: number,
  type?: string,
) {
  const path = `ws/${workspaceId}/project/${projectId}/${kind}/${id}`;
  return addBlob(db, workspaceId, path, size, { projectId, type });
}

const PDF_PROJECT: ProjectCreate = {
  id: "deck",
  folderId: "f1",
  name: "Deck",
  source: {
    kind: "pages",
    origin: "pdf",
    fileName: "deck.pdf",
    pages: [
      { id: "page-1", blobKey: "page:page-1", name: "Page 1" },
      { id: "page-2", blobKey: "page:page-2", name: "Page 2" },
    ],
  },
};

/**
 * A workspace with four projects that store files: a website with a snapshot
 * and a crop, a PDF (archived), images, and a trashed website. Plus its logo.
 */
export async function storedWorkspace(db: Database, workspaceId: string) {
  await addFolder(db, workspaceId);
  await createProject(db, workspaceId, { ...URL_PROJECT("site"), name: "Site" }, NOW);
  await createProject(db, workspaceId, PDF_PROJECT, NOW);
  await createProject(db, workspaceId, { ...PAGES_PROJECT("shots"), name: "Shots" }, NOW);
  await createProject(db, workspaceId, { ...URL_PROJECT("old"), name: "Old" }, NOW);
  await addProjectBlob(db, workspaceId, "site", "snapshot", "s1", 300);
  await addProjectBlob(db, workspaceId, "site", "crop", "c1", 20);
  await addProjectBlob(db, workspaceId, "deck", "page", "page-1", 500);
  await addProjectBlob(db, workspaceId, "deck", "page", "page-2", 400);
  await addProjectBlob(db, workspaceId, "shots", "page", "page-1", 100);
  await addProjectBlob(db, workspaceId, "old", "snapshot", "s2", 50);
  await addBlob(db, workspaceId, `ws/${workspaceId}/brand/logo/l1`, 7);
  await setArchived(db, workspaceId, "deck", true, NOW);
  await trashProject(db, workspaceId, "old", NOW);
}
