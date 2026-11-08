import { after } from "next/server";
import { emailChangedNoticeSender } from "@/lib/account/account-email";
import { handleEmailChangeConfirm } from "@/lib/account/email-change-confirm-handler";
import { database } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/auth/email-change/confirm`: see `handleEmailChangeConfirm`. */
export function POST(request: Request) {
  return handleEmailChangeConfirm(request, {
    db: database(),
    now: Date.now(),
    sendNotice: emailChangedNoticeSender(),
    defer: after,
  });
}
