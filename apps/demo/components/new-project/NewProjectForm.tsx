"use client";

import { useId, useState, type FormEvent } from "react";
import { prepareImage } from "@/lib/image";
import {
  createFolder,
  createPagesProject,
  createProject,
  type ImageUpload,
} from "@/lib/store/actions";
import type { Folder, Project } from "@/lib/store/types";
import { baseName, displayHost, normalizeUrl } from "@/lib/url";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { FolderPicker, NEW_FOLDER } from "./FolderPicker";
import { ImageDropzone } from "./ImageDropzone";
import { UrlField } from "./UrlField";

type SourceKind = "url" | "image";

/** What the form collected: an address, or a prepared image to store. */
type SourceDraft = { kind: "url"; url: string } | { kind: "image"; image: ImageUpload };

const SOURCE_OPTIONS: ReadonlyArray<SegmentOption<SourceKind>> = [
  { value: "url", label: "Website", icon: "globe" },
  { value: "image", label: "Image", icon: "image" },
];

interface NewProjectFormProps {
  folders: readonly Folder[];
  defaultFolderId: string;
  onCreated: (project: Project) => void;
  onCancel: () => void;
}

/**
 * Website or image source, an optional project name, and folder (optionally a new one).
 * The name suggested by the host or file name is a placeholder, never typed into the field,
 * so whatever someone types is exactly the name; an empty field falls back to the suggestion.
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
  const [image, setImage] = useState<ImageUpload | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [name, setName] = useState("");
  const [urlSuggestion, setUrlSuggestion] = useState<string | null>(null);
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const formErrorId = useId();

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

  const onFile = async (file: File) => {
    setProcessing(true);
    setImageError(null);
    const result = await prepareImage(file);
    setProcessing(false);
    if (!result.ok) {
      setImageError(result.error);
      return;
    }
    const { dataUrl, width, height } = result;
    setImage({ dataUrl, fileName: file.name, width, height });
  };

  const resolveSource = (): SourceDraft | null => {
    if (kind === "url") {
      if (url.trim()) return checkUrl();
      setUrlError("Enter a website address.");
      return null;
    }
    if (!image) {
      setImageError(processing ? "Wait for the image to finish preparing." : "Choose an image.");
      return null;
    }
    return { kind: "image", image };
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

  const create = (draft: SourceDraft, folder: string) => {
    if (draft.kind === "url") {
      const projectName = name.trim() || displayHost(draft.url);
      return Promise.resolve(createProject({ folderId: folder, name: projectName, source: draft }));
    }
    const projectName = name.trim() || baseName(draft.image.fileName);
    const { image: picked } = draft;
    return createPagesProject({
      folderId: folder,
      name: projectName,
      origin: "image",
      fileName: picked.fileName,
      images: [picked],
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    const draft = resolveSource();
    if (!draft) return;
    const targetFolder = resolveFolder();
    if (!targetFolder) return;
    setSaving(true);
    const created = await create(draft, targetFolder);
    setSaving(false);
    if (!created.ok) {
      setFormError(created.error);
      return;
    }
    onCreated(created.value);
  };

  const suggestion = kind === "url" ? urlSuggestion : image ? baseName(image.fileName) : null;
  const placeholder = suggestion ?? (kind === "url" ? "Homepage redesign" : "Checkout mockup");

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
        <ImageDropzone
          image={image}
          processing={processing}
          error={imageError}
          onFile={(file) => void onFile(file)}
        />
      )}

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
        <Button type="submit" disabled={processing || saving} data-testid="create-project">
          {saving ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
