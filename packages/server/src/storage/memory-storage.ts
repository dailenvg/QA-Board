import { encodeBase64 } from "../lib/base64";
import {
  PinNotFoundError,
  type PinDraft,
  type ScreenshotStore,
  type StorageAdapter,
} from "../storage";
import type { Pin } from "../types";

export interface MemoryStorageOptions {
  /** Pins to start with. */
  pins?: Pin[];
  /** Where screenshots go. Defaults to inline data URLs, handy for local development. */
  screenshots?: ScreenshotStore;
}

/** Runs synchronously but reports failures as rejections, like a real adapter. */
function settle<T>(run: () => T): Promise<T> {
  return Promise.resolve().then(run);
}

/** In-process storage for development and tests. Data is lost on restart. */
export function createMemoryStorage(options: MemoryStorageOptions = {}): StorageAdapter {
  const pins = new Map<string, Pin>(
    (options.pins ?? []).map((pin) => [pin.id, structuredClone(pin)]),
  );

  function find(branch: string, pinId: string): Pin {
    const pin = pins.get(pinId);
    if (!pin || pin.branch !== branch) throw new PinNotFoundError(pinId);
    return pin;
  }

  function save(pin: Pin): Pin {
    pins.set(pin.id, pin);
    return structuredClone(pin);
  }

  return {
    listPins({ branch, path }) {
      return settle(() =>
        [...pins.values()]
          .filter((pin) => pin.branch === branch && pin.path === path)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((pin) => structuredClone(pin)),
      );
    },

    async createPin({ screenshot, ...draft }: PinDraft) {
      const screenshotUrl = !screenshot
        ? null
        : options.screenshots
          ? await options.screenshots.save({ branch: draft.branch, pinId: draft.id, screenshot })
          : `data:${screenshot.contentType};base64,${encodeBase64(screenshot.data)}`;
      return save({ ...draft, screenshotUrl });
    },

    addReply({ branch, pinId, reply }) {
      return settle(() => {
        const pin = find(branch, pinId);
        return save({ ...pin, replies: [...pin.replies, reply] });
      });
    },

    resolvePin({ branch, pinId, resolvedBy, resolvedAt }) {
      return settle(() => {
        const pin = find(branch, pinId);
        return pin.resolved
          ? structuredClone(pin)
          : save({ ...pin, resolved: true, resolvedAt, resolvedBy });
      });
    },

    expire(cutoff) {
      return settle(() => {
        const old = [...pins.values()].filter((pin) => Date.parse(pin.createdAt) <= cutoff);
        for (const pin of old) pins.delete(pin.id);
        return { expired: old.length, done: true };
      });
    },
  };
}
