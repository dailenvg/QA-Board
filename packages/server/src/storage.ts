import type { Pin, Reply } from "./types";

/** A decoded screenshot, already validated and size-checked by the handler. */
export interface Screenshot {
  contentType: "image/png" | "image/jpeg";
  data: Uint8Array;
}

/** Everything needed to persist a new pin. Ids and timestamps are set by the handler. */
export interface PinDraft extends Omit<Pin, "screenshotUrl" | "branch"> {
  branch: string;
  screenshot: Screenshot | null;
}

export interface ListPinsParams {
  branch: string;
  path: string;
}

export interface AddReplyParams {
  branch: string;
  pinId: string;
  reply: Reply;
}

export interface ResolvePinParams {
  branch: string;
  pinId: string;
  resolvedBy: string;
  resolvedAt: string;
}

/** Persistence for pins. Implementations: memory, GitHub, Postgres. */
export interface StorageAdapter {
  listPins(params: ListPinsParams): Promise<Pin[]>;
  createPin(draft: PinDraft): Promise<Pin>;
  addReply(params: AddReplyParams): Promise<Pin>;
  resolvePin(params: ResolvePinParams): Promise<Pin>;
}

export interface SaveScreenshotParams {
  branch: string;
  pinId: string;
  screenshot: Screenshot;
}

/** Where screenshot images live. Returns a URL that can be embedded in comments. */
export interface ScreenshotStore {
  save(params: SaveScreenshotParams): Promise<string>;
}

/** Base class for storage failures the handler maps to an HTTP status. */
export class StorageError extends Error {
  readonly status: number;
  /** Brand checked by `isStorageError`, so detection survives duplicated CJS bundles. */
  readonly pinpointStorageError = true;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return (
    error instanceof StorageError ||
    (error instanceof Error &&
      "pinpointStorageError" in error &&
      error.pinpointStorageError === true &&
      "status" in error &&
      typeof error.status === "number")
  );
}

export class PinNotFoundError extends StorageError {
  constructor(pinId: string) {
    super(404, `Pin ${pinId} not found`);
    this.name = "PinNotFoundError";
  }
}

export class StorageLimitError extends StorageError {
  constructor(message: string) {
    super(413, message);
    this.name = "StorageLimitError";
  }
}
