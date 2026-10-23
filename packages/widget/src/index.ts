"use client";

export { PinpointProvider, type PinpointProviderProps } from "./ui/PinpointProvider";
export type { PinpointWidgetProps } from "./ui/PinpointWidget";

export {
  PinpointRequestError,
  PinpointUnauthorizedError,
  type PinpointClient,
} from "./core/client";
export { createHttpClient, DEFAULT_ENDPOINT, type HttpClientOptions } from "./core/api-client";
export { createMemoryClient, type MemoryClientOptions } from "./mock/memory-client";

export { computeAnchor, resolveAnchor, type ResolvedPosition } from "./core/anchor";
export { generateSelector, isStableId, resolveSelector } from "./core/selector";
export { buildDeepLink, cleanPageUrl, PIN_PARAM, readPinParam } from "./core/deeplink";
export { captureToken, REVIEW_PARAM } from "./core/token";

export {
  MAX_BODY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SCREENSHOT_BYTES,
  PRIORITIES,
  TOKEN_HEADER,
  type AddReplyInput,
  type CreatePinInput,
  type ErrorResponse,
  type ListPinsQuery,
  type ListPinsResponse,
  type Pin,
  type PinAnchor,
  type PinContext,
  type PinResponse,
  type Priority,
  type Reply,
  type ResolvePinInput,
  type UpdatePinRequest,
} from "./core/types";
