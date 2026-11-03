import { handleResetComplete } from "@/lib/auth/reset-complete-handler";
import { database } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/auth/reset/complete`: see `handleResetComplete`. */
export function POST(request: Request) {
  return handleResetComplete(request, { db: database(), now: Date.now() });
}
