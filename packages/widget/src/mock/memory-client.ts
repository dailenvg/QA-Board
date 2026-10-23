import {
  PinpointRequestError,
  PinpointUnauthorizedError,
  type PinpointClient,
} from "../core/client";
import { buildDeepLink } from "../core/deeplink";
import type { Pin } from "../core/types";

export interface MemoryClientOptions {
  /** Pins to start with. */
  pins?: Pin[];
  /** Branch stamped on created pins. */
  branch?: string | null;
  /** Artificial latency, useful for exercising loading states. */
  latencyMs?: number;
  /** Token check; return false to simulate a 401. Accepts any non-empty token by default. */
  isTokenValid?: (token: string) => boolean;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** In-memory `PinpointClient` for local development and tests. No network. */
export function createMemoryClient(options: MemoryClientOptions = {}): PinpointClient {
  const store = new Map<string, Pin>(
    (options.pins ?? []).map((pin) => [pin.id, structuredClone(pin)]),
  );
  const isTokenValid = options.isTokenValid ?? ((token: string) => token.trim() !== "");

  async function guard(token: string): Promise<void> {
    await delay(options.latencyMs ?? 0);
    if (!isTokenValid(token)) throw new PinpointUnauthorizedError();
  }

  function update(pinId: string, change: (pin: Pin) => Pin): Pin {
    const pin = store.get(pinId);
    if (!pin) throw new PinpointRequestError(404, `Pin ${pinId} not found`);
    const next = change(pin);
    store.set(pinId, next);
    return structuredClone(next);
  }

  return {
    async listPins(token, query) {
      await guard(token);
      return [...store.values()]
        .filter((pin) => pin.path === query.path)
        .map((pin) => structuredClone(pin));
    },

    async createPin(token, input) {
      await guard(token);
      const id = randomId();
      const pin: Pin = {
        id,
        path: input.path,
        branch: options.branch ?? null,
        deploymentUrl: new URL(input.pageUrl).origin,
        deepLink: buildDeepLink(input.pageUrl, id),
        anchor: input.anchor,
        author: input.author,
        body: input.body,
        priority: input.priority,
        screenshotUrl: input.screenshot,
        context: input.context,
        replies: [],
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: new Date().toISOString(),
      };
      store.set(id, pin);
      return structuredClone(pin);
    },

    async addReply(token, input) {
      await guard(token);
      return update(input.pinId, (pin) => ({
        ...pin,
        replies: [
          ...pin.replies,
          {
            id: randomId(),
            author: input.author,
            body: input.body,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    },

    async resolvePin(token, input) {
      await guard(token);
      return update(input.pinId, (pin) => ({
        ...pin,
        resolved: true,
        resolvedAt: new Date().toISOString(),
        resolvedBy: input.author,
      }));
    },
  };
}
