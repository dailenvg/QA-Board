import { after } from "next/server";
import { authOrigin } from "@/lib/auth/auth-url";
import { resetEmailSender } from "@/lib/auth/reset-email";
import { handleResetRequest } from "@/lib/auth/reset-request-handler";
import { database } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/auth/reset`: see `handleResetRequest`. */
export function POST(request: Request) {
  return handleResetRequest(request, {
    db: database(),
    now: Date.now(),
    origin: authOrigin(),
    send: resetEmailSender(),
    defer: after,
  });
}
