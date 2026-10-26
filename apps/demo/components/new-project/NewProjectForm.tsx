"use client";

import { useId, useState, type FormEvent } from "react";
import { createFolder } from "@/lib/store/actions";
import type { Folder, Project } from "@/lib/store/types";
import { baseName, displayHost, normalizeUrl } from "@/lib/url";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import type { ImageGrouping } from "./CombineChoice";
import { FolderPicker, NEW_FOLDER } from "./FolderPicker";
import { ImagesField } from "./ImagesField";
import { PdfPicker } from "./PdfPicker";
import { UrlField } from "./UrlField";
import { imagesProblem, pdfProblem, readyImages, type SourceDraft } from "./source-draft";
import { useCreateProjects } from "./use-create-projects";
import { usePdfImport } from "./use-pdf-import";
import { usePickedImages } from "./use-picked-images";

type SourceKind = "url" | "image" | "pdf";

const SOURCE_OPTIONS: ReadonlyArray<SegmentOption<SourceKind>> = [
  { value: "url", label: "Website", icon: "globe" },
  { value: "image", label: "Image", icon: "image" },
  { value: "pdf", label: "PDF", icon: "fileText", testId: "source-pdf" },
];

const PLACEHOLDER: Record<SourceKind, string> = {
  url: "Homepage redesign",
  image: "Checkout mockup",
  pdf: "Pitch deck",
};

interface NewProjectFormProps {
  folders: readonly Folder[];
  defaultFolderId: string;
  /** Every project created, in order (several when images are added one project per file). */
  onCreated: (projects: Project[]) => void;
  onCancel: () => void;
}

/**
 * Website, image or PDF source, an optional project name, and folder (optionally a new one).
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
  const pdf = usePdfImport();
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [urlSuggestion, setUrlSuggestion] = useState<string | null>(null);
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { progress, create } = useCreateProjects();
  const nameId = useId();
  const formErrorId = useId();
  const several = picked.items.length > 1;
  const combining = several && grouping === "combine";
  const named = kind !== "image" || !several || combining;

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
    if (kind === "pdf") {
      const problem = pdfProblem(pdf.state);
      // A failed PDF already shows its error in the picker.
      setSourceError(pdf.state.status === "failed" ? null : problem);
      return pdf.state.status === "ready"
        ? { kind: "pdf", fileName: pdf.state.fileName, pages: pdf.state.pages }
        : null;
    }
    const problem = imagesProblem(picked.items);
    setSourceError(problem);
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (progress) return;
    setFormError(null);
    const draft = resolveSource();
    if (!draft) return;
    const targetFolder = resolveFolder();
    if (!targetFolder) return;
    const created = await create(draft, targetFolder, name);
    if (!created.ok) {
      setFormError(created.error);
      return;
    }
    onCreated(created.value);
  };

  const pdfName = pdf.state.status === "idle" ? null : pdf.state.fileName;
  const fileName = kind === "pdf" ? pdfName : picked.items[0]?.fileName;
  const suggestion = kind === "url" ? urlSuggestion : fileName ? baseName(fileName) : null;
  const placeholder = suggestion ?? PLACEHOLDER[kind];
  const creating = progress
    ? progress.total > 1 && !combining
      ? `Creating ${progress.done + 1} of ${progress.total}…`
      : "Creating…"
    : null;
  const pdfPages = pdf.state.status === "ready" ? pdf.state.pages.length : 0;
  const pages = kind === "pdf" ? pdfPages : combining ? picked.items.length : 0;
  const submitLabel =
    pages > 1
      ? `Create project with ${pages} pages`
      : kind === "image" && several
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
        icons="sm"
        options={SOURCE_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          // "Choose a PDF." doesn't belong under the image dropzone, and so on.
          setSourceError(null);
        }}
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
      ) : kind === "image" ? (
        <ImagesField
          picked={picked}
          grouping={grouping}
          onGrouping={setGrouping}
          error={sourceError}
          onChange={() => setSourceError(null)}
        />
      ) : (
        <PdfPicker
          state={pdf.state}
          error={sourceError}
          onFile={(file) => {
            setSourceError(null);
            void pdf.choose(file);
          }}
          onTakeFirstPages={pdf.takeFirstPages}
          onCancel={pdf.cancel}
        />
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
      {/* The submit button's text changes while focused, which screen readers don't read out. */}
      <p aria-live="polite" className="sr-only">
        {creating ?? ""}
      </p>

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
