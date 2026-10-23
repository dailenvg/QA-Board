import type { AddReplyInput, CreatePinInput, ListPinsQuery, Pin, ResolvePinInput } from "./types";

/**
 * Transport used by the widget. The review token is an explicit argument so an
 * implementation can never be called without one by accident.
 */
export interface PinpointClient {
  listPins(token: string, query: ListPinsQuery): Promise<Pin[]>;
  createPin(token: string, input: CreatePinInput): Promise<Pin>;
  addReply(token: string, input: AddReplyInput): Promise<Pin>;
  resolvePin(token: string, input: ResolvePinInput): Promise<Pin>;
}

/** Thrown when the token is missing or rejected. The widget hides itself. */
export class PinpointUnauthorizedError extends Error {
  constructor(message = "Review token is missing or invalid") {
    super(message);
    this.name = "PinpointUnauthorizedError";
  }
}

/** Thrown for any other non-2xx response. */
export class PinpointRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PinpointRequestError";
    this.status = status;
  }
}

export function assertToken(token: string): void {
  if (token.trim() === "") throw new PinpointUnauthorizedError();
}
