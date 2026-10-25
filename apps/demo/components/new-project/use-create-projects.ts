import { useState } from "react";
import { createPagesProject, createProject, type ImageUpload } from "@/lib/store/actions";
import type { Result } from "@/lib/store/store";
import type { Project } from "@/lib/store/types";
import { baseName, displayHost } from "@/lib/url";
import type { SourceDraft } from "./source-draft";

/** Projects created so far out of how many, while creating. */
export interface CreateProgress {
  done: number;
  total: number;
}

/** One image project from `images`, in order, named `name`. */
function createImages(images: ImageUpload[], folderId: string, name: string) {
  const [first] = images;
  return createPagesProject({
    folderId,
    name,
    origin: "image",
    fileName: first?.fileName ?? "image",
    images,
  });
}

const single = (result: Result<Project>): Result<Project[]> =>
  result.ok ? { ok: true, value: [result.value] } : result;

/**
 * Creates the projects a draft describes: a website; one image project (a
 * single image, or several combined into pages); one project per image; or a
 * PDF's pages. An empty `name` falls back to the host or the first file's name.
 */
export function useCreateProjects() {
  const [progress, setProgress] = useState<CreateProgress | null>(null);

  /** One project per image, in order; stops at the first failure, keeping those already made. */
  const createEach = async (
    images: ImageUpload[],
    folderId: string,
  ): Promise<Result<Project[]>> => {
    const created: Project[] = [];
    for (const image of images) {
      setProgress({ done: created.length, total: images.length });
      const result = await createImages([image], folderId, baseName(image.fileName));
      if (!result.ok) {
        const made = created.length
          ? ` ${created.length} of ${images.length} projects were added.`
          : "";
        return { ok: false, error: `${result.error}${made}` };
      }
      created.push(result.value);
    }
    return { ok: true, value: created };
  };

  const createFor = async (
    draft: SourceDraft,
    folderId: string,
    name: string,
  ): Promise<Result<Project[]>> => {
    switch (draft.kind) {
      case "url":
        return single(
          createProject({ folderId, name: name || displayHost(draft.url), source: draft }),
        );
      case "pdf":
        return single(
          await createPagesProject({
            folderId,
            name: name || baseName(draft.fileName),
            origin: "pdf",
            fileName: draft.fileName,
            images: draft.pages,
          }),
        );
      case "image":
        if (draft.grouping === "separate" && draft.images.length > 1) {
          return createEach(draft.images, folderId);
        }
        return single(
          await createImages(
            draft.images,
            folderId,
            name || baseName(draft.images[0]?.fileName ?? ""),
          ),
        );
    }
  };

  /** Creates the draft's projects; `progress` is set until it's done. */
  const create = async (draft: SourceDraft, folderId: string, name: string) => {
    setProgress({ done: 0, total: draft.kind === "image" ? draft.images.length : 1 });
    const result = await createFor(draft, folderId, name.trim());
    setProgress(null);
    return result;
  };

  return { progress, create };
}
