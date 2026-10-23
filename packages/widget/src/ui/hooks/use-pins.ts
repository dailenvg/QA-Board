import { useCallback, useEffect, useState } from "react";
import { PinpointUnauthorizedError, type PinpointClient } from "../../core/client";
import type { AddReplyInput, CreatePinInput, Pin, ResolvePinInput } from "../../core/types";
import { useLatest } from "./use-latest";

export type PinsStatus = "loading" | "ready" | "error";

interface LoadResult {
  key: string;
  pins: Pin[];
  error: Error | null;
}

interface UsePinsOptions {
  client: PinpointClient;
  token: string;
  path: string;
  onUnauthorized: () => void;
  onLoaded?: (pins: Pin[]) => void;
}

export interface PinsApi {
  status: PinsStatus;
  pins: Pin[];
  error: Error | null;
  retry: () => void;
  createPin: (input: CreatePinInput) => Promise<Pin>;
  addReply: (input: AddReplyInput) => Promise<Pin>;
  resolvePin: (input: ResolvePinInput) => Promise<Pin>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function upsert(pins: Pin[], pin: Pin): Pin[] {
  const index = pins.findIndex((existing) => existing.id === pin.id);
  if (index === -1) return [...pins, pin];
  return pins.map((existing, i) => (i === index ? pin : existing));
}

/** Loads pins for a page and exposes mutations. Never calls the client without a token. */
export function usePins({
  client,
  token,
  path,
  onUnauthorized,
  onLoaded,
}: UsePinsOptions): PinsApi {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const key = `${path}\n${attempt}`;
  const callbacks = useLatest({ onUnauthorized, onLoaded });

  useEffect(() => {
    let cancelled = false;
    client.listPins(token, { path }).then(
      (pins) => {
        if (cancelled) return;
        setResult({ key, pins, error: null });
        callbacks.current.onLoaded?.(pins);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof PinpointUnauthorizedError) callbacks.current.onUnauthorized();
        setResult({ key, pins: [], error: toError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, token, path, key, callbacks]);

  const mutate = useCallback(
    async (run: () => Promise<Pin>): Promise<Pin> => {
      try {
        const pin = await run();
        setResult((current) => current && { ...current, pins: upsert(current.pins, pin) });
        return pin;
      } catch (error) {
        if (error instanceof PinpointUnauthorizedError) callbacks.current.onUnauthorized();
        throw toError(error);
      }
    },
    [callbacks],
  );

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const createPin = useCallback(
    (input: CreatePinInput) => mutate(() => client.createPin(token, input)),
    [client, token, mutate],
  );
  const addReply = useCallback(
    (input: AddReplyInput) => mutate(() => client.addReply(token, input)),
    [client, token, mutate],
  );
  const resolvePin = useCallback(
    (input: ResolvePinInput) => mutate(() => client.resolvePin(token, input)),
    [client, token, mutate],
  );

  const current = result?.key === key ? result : null;
  return {
    status: current === null ? "loading" : current.error ? "error" : "ready",
    pins: current?.pins ?? [],
    error: current?.error ?? null,
    retry,
    createPin,
    addReply,
    resolvePin,
  };
}
