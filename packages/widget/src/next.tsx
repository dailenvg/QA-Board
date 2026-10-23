"use client";

import {
  PinpointProvider as CorePinpointProvider,
  type PinpointProviderProps,
} from "./ui/PinpointProvider";

// Next.js inlines `process.env.NEXT_PUBLIC_*` at build time; only literal accesses are replaced.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

/**
 * Next.js flavour of `PinpointProvider`. Reads Vercel's public env vars so
 * the widget is enabled on preview deployments and shows the branch name.
 * Both can still be overridden through props.
 */
export function PinpointProvider({ enabled, branch, ...props }: PinpointProviderProps) {
  return (
    <CorePinpointProvider
      {...props}
      enabled={enabled ?? process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"}
      branch={branch ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null}
    />
  );
}

export type { PinpointProviderProps };
export {
  createHttpClient,
  createMemoryClient,
  type MemoryClientOptions,
  type PinpointClient,
} from "./index";
