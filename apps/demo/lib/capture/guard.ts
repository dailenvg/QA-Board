import { lookup, type LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import { isBlockedAddress, isBlockedHostname, isIpLiteral } from "../frame-check/address";

const BLOCKED_CODE = "ESQUINTBLOCKED";

/** The connection would reach a loopback, private, link-local or otherwise non-public address. */
export class BlockedHostError extends Error {
  readonly code = BLOCKED_CODE;
  constructor() {
    super("Refused a non-public address");
    this.name = "BlockedHostError";
  }
}

export function isBlockedError(error: unknown): boolean {
  return (
    error instanceof BlockedHostError ||
    (typeof error === "object" && error !== null && "code" in error && error.code === BLOCKED_CODE)
  );
}

/** Literal and conventionally local hosts; literals never reach `lookup`, so they're checked here. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) return true;
  return isIpLiteral(host) && isBlockedAddress(host);
}

/**
 * DNS lookup for outgoing sockets that fails when any resolved address is
 * non-public. The socket connects to exactly the addresses checked here, so
 * a rebinding DNS answer can't slip a private address in after the check.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) {
      callback(error, "");
      return;
    }
    const first = addresses[0];
    if (!first || addresses.some(({ address }) => isBlockedAddress(address))) {
      callback(Object.assign(new BlockedHostError(), { errno: 0, syscall: "lookup" }), "");
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
};
