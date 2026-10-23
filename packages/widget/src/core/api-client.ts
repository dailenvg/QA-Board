import {
  assertToken,
  PinpointRequestError,
  PinpointUnauthorizedError,
  type PinpointClient,
} from "./client";
import {
  TOKEN_HEADER,
  type ListPinsResponse,
  type Pin,
  type PinResponse,
  type UpdatePinRequest,
} from "./types";

export const DEFAULT_ENDPOINT = "/api/pinpoint";

export interface HttpClientOptions {
  /** Route that mounts the server handler. Defaults to `/api/pinpoint`. */
  endpoint?: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

type Method = "GET" | "POST" | "PATCH";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return `Request failed with status ${status}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function expectPin(body: unknown): Pin {
  if (isRecord(body) && isRecord(body.pin)) return (body as unknown as PinResponse).pin;
  throw new PinpointRequestError(500, "Malformed response from pinpoint server");
}

function expectPins(body: unknown): Pin[] {
  if (isRecord(body) && Array.isArray(body.pins)) return (body as unknown as ListPinsResponse).pins;
  throw new PinpointRequestError(500, "Malformed response from pinpoint server");
}

/** HTTP implementation targeting the `@pinpoint/server` route handler. */
export function createHttpClient(options: HttpClientOptions = {}): PinpointClient {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request(
    method: Method,
    token: string,
    url: string,
    payload?: unknown,
  ): Promise<unknown> {
    assertToken(token);
    const headers: Record<string, string> = { [TOKEN_HEADER]: token, accept: "application/json" };
    if (payload !== undefined) headers["content-type"] = "application/json";

    const response = await doFetch(url, {
      method,
      headers,
      credentials: "same-origin",
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const body = await readJson(response);

    if (response.status === 401) throw new PinpointUnauthorizedError(readErrorMessage(body, 401));
    if (!response.ok)
      throw new PinpointRequestError(response.status, readErrorMessage(body, response.status));
    return body;
  }

  function patch(token: string, update: UpdatePinRequest): Promise<Pin> {
    return request("PATCH", token, endpoint, update).then(expectPin);
  }

  const querySeparator = endpoint.includes("?") ? "&" : "?";

  return {
    listPins: (token, query) =>
      request(
        "GET",
        token,
        `${endpoint}${querySeparator}path=${encodeURIComponent(query.path)}`,
      ).then(expectPins),
    createPin: (token, input) => request("POST", token, endpoint, input).then(expectPin),
    addReply: (token, input) => patch(token, { action: "reply", ...input }),
    resolvePin: (token, input) => patch(token, { action: "resolve", ...input }),
  };
}
