import { handleJoin } from "@/lib/auth/join-handler";
import { database } from "@/lib/db/database";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/auth/join`: see `handleJoin`. */
export function POST(request: Request) {
  return handleJoin(request, {
    db: database(),
    now: Date.now(),
    services: { blobs: blobDriverFromEnv() },
  });
}
