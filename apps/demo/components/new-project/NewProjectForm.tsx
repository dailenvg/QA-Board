"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type FormEvent } from "react";
import { useRevealVariants } from "@/lib/motion";
import {
  createFolder,
  createPagesProject,
  createProject,
  type ImageUpload,
} from "@/lib/store/actions";
import type { Result } from "@/lib/store/store";
import type { Folder, Project } from "@/lib/store/types";
import { baseName, displayHost, normalizeUrl } from "@/lib/url";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { CombineChoice, type ImageGrouping } from "./CombineChoice";
import { FolderPicker, NEW_FOLDER } from "./FolderPicker";
import { ImageDropzone } from "./ImageDropzone";
import { PickedImageList } from "./PickedImageList";
import { UrlField } from "./UrlField";
import { usePickedImages, type PickedImage } from "./use-picked-images";

type SourceKind = "url" | "image";

/** What the form collected: an address, or prepared images and how to group them. */
type SourceDraft =
  { kind: "url"; url: string } | { kind: "image"; images: ImageUpload[]; grouping: ImageGrouping };

const SOURCE_OPTIONS: ReadonlyArray<SegmentOption<SourceKind>> = [
  { value: "url", label: "Website", icon: "globe" },
  { value: "image", label: "Image", icon: "image" },
];

interface NewProjectFormProps {
  folders: readonly Folder[];
  defaultFolderId: string;
  /** Every project created, in order (several when images are added one project per file). */
  onCreated: (projects: Project[]) => void;
  onCancel: () => void;
}

/** Why the chosen images can't be used yet, or null when they're all ready. */
function imagesProblem(items: readonly PickedImage[]): string | null {
  if (items.length === 0) return "Choose an image.";
  if (items.some((item) => item.status === "preparing")) {
    return "Wait for the images to finish preparing.";
  }
  if (items.some((item) => item.status === "failed")) {
    return "Remove the images that couldn't be prepared, then try again.";
  }
  return null;
}

const readyImages = (items: readonly PickedImage[]): ImageUpload[] =>
  items.flatMap((item) => (item.status === "ready" ? [item.image] : []));

/**
 * Website or image source, an optional project name, and folder (optionally a new one).
 * Several images become one project each, or one project with a page per image, in an
 * order that can be changed. The name suggested by the host or file name is a placeholder,
 * never typed into the field, so whatever someone types is exactly the name; an empty field
 * falls back to the suggestion.
 */
export function NewProjectForm({
  folders,
  defaultFolderId,
  onCreated,
  onCancel,
}: NewProjectFormProps) {
  const [kind, setKind] = useState<SourceKind>("url");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const picked = usePickedImages();
  const [grouping, setGrouping] = useState<ImageGrouping>("separate");
  const [imageError, setImageError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [urlSuggestion, setUrlSuggestion] = useState<string | null>(null);
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const nameId = useId();
  const formErrorId = useId();
  const reveal = useRevealVariants();
  const several = picked.items.length > 1;
  const combining = several && grouping === "combine";
  const named = kind === "url" || !several || combining;

  const checkUrl = (): SourceDraft | null => {
    const result = normalizeUrl(url);
    if (!result.ok) {
      setUrlError(result.error);
      return null;
    }
    setUrl(result.url);
    setUrlError(null);
    setUrlSuggestion(displayHost(result.url));
    return { kind: "url", url: result.url };
  };

  const resolveSource = (): SourceDraft | null => {
    if (kind === "url") {
      if (url.trim()) return checkUrl();
      setUrlError("Enter a website address.");
      return null;
    }
    const problem = imagesProblem(picked.items);
    setImageError(problem);
    return problem
      ? null
      : {
          kind: "image",
          images: readyImages(picked.items),
          grouping: combining ? "combine" : "separate",
        };
  };

  const resolveFolder = (): string | null => {
    if (folderId !== NEW_FOLDER) return folderId;
    if (!newFolderName.trim()) {
      setNewFolderError("Name the new folder.");
      return null;
    }
    const created = createFolder(newFolderName);
    if (!created.ok) {
      setFormError(created.error);
      return null;
    }
    setFolderId(created.value.id);
    return created.value.id;
  };

  /** One image project: typed name (combined or single), else the first file's. */
  const createImages = (images: ImageUpload[], folder: string, projectName: string) => {
    const [first] = images;
    return createPagesProject({
      folderId: folder,
      name: projectName,
      origin: "image",
      fileName: first?.fileName ?? "image",
      images,
    });
  };

  /** One project per image, in order; stops at the first failure, keeping those already made. */
  const createEach = async (images: ImageUpload[], folder: string): Promise<Result<Project[]>> => {
    const created: Project[] = [];
    for (const image of images) {
      setProgress({ done: created.length, total: images.length });
      const result = await createImages([image], folder, baseName(image.fileName));
      if (!result.ok) {
        const made = created.length ? ` ${created.length} of ${images.length} were added.` : "";
        return { ok: false, error: `${result.error}${made}` };
      }
      created.push(result.value);
    }
    return { ok: true, value: created };
  };

  const create = async (draft: SourceDraft, folder: string): Promise<Result<Project[]>> => {
    if (draft.kind === "url") {
      const projectName = name.trim() || displayHost(draft.url);
      const result = createProject({ folderId: folder, name: projectName, source: draft });
      return result.ok ? { ok: true, value: [result.value] } : result;
    }
    if (draft.grouping === "separate" && draft.images.length > 1) {
      return createEach(draft.images, folder);
    }
    const projectName = name.trim() || baseName(draft.images[0]?.fileName ?? "");
    const result = await createImages(draft.images, folder, projectName);
    return result.ok ? { ok: true, value: [result.value] } : result;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (progress) return;
    setFormError(null);
    const draft = resolveSource();
    if (!draft) return;
    const targetFolder = resolveFolder();
    if (!targetFolder) return;
    setProgress({ done: 0, total: draft.kind === "image" ? draft.images.length : 1 });
    const created = await create(draft, targetFolder);
    setProgress(null);
    if (!created.ok) {
      setFormError(created.error);
      return;
    }
    onCreated(created.value);
  };

  const firstName = picked.items[0]?.fileName;
  const suggestion = kind === "url" ? urlSuggestion : firstName ? baseName(firstName) : null;
  const placeholder = suggestion ?? (kind === "url" ? "Homepage redesign" : "Checkout mockup");
  const creating = progress
    ? progress.total > 1 && !combining
      ? `Creating ${progress.done + 1} of ${progress.total}…`
      : "Creating…"
    : null;
  const submitLabel = combining
    ? `Create project with ${picked.items.length} pages`
    : several
      ? `Create ${picked.items.length} projects`
      : "Create project";

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-5"
      aria-describedby={formErrorId}
    >
      <SegmentedControl
        label="Project source"
        layoutId="new-project-source"
        options={SOURCE_OPTIONS}
        value={kind}
        onChange={setKind}
        stretch
      />

      {kind === "url" ? (
        <UrlField
          value={url}
          error={urlError}
          onChange={(value) => {
            setUrl(value);
            if (urlError) setUrlError(null);
          }}
          onBlur={() => {
            if (url.trim()) checkUrl();
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <ImageDropzone
            hasImages={picked.items.length > 0}
            error={imageError ?? picked.notice}
            onFiles={(files) => {
              setImageError(null);
              picked.add(files);
            }}
          />
          <AnimatePresence initial={false}>
            {several ? (
              <motion.div
                key="grouping"
                variants={reveal}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <CombineChoice value={grouping} onChange={setGrouping} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {picked.items.length ? (
            <PickedImageList
              items={picked.items}
              orderable={combining}
              onMove={picked.move}
              onReorder={picked.reorder}
              onRemove={(key) => {
                setImageError(null);
                picked.remove(key);
              }}
            />
          ) : null}
        </div>
      )}

      {named ? (
        <div>
          <label htmlFor={nameId} className="mb-2 block text-body font-semibold">
            Project name (optional)
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder={placeholder}
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      ) : (
        <p className="text-meta text-muted">Each project is named after its file.</p>
      )}

      <FolderPicker
        folders={folders}
        value={folderId}
        onChange={(value) => {
          setFolderId(value);
          setNewFolderError(null);
        }}
        newName={newFolderName}
        onNewName={(value) => {
          setNewFolderName(value);
          setNewFolderError(null);
        }}
        onNewNameBlur={() => {
          if (!newFolderName.trim()) setNewFolderError("Name the new folder.");
        }}
        newNameError={newFolderError}
      />

      <FieldError id={formErrorId} message={formError} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          aria-disabled={progress ? true : undefined}
          data-testid="create-project"
        >
          {creating ?? submitLabel}
        </Button>
      </div>
    </form>
  );
}
