import type { NextRequest } from "next/server";
import { handleLogin } from "@/lib/auth/login-handler";
import { database } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/auth/login`: see `handleLogin`. */
export function POST(request: NextRequest) {
  return handleLogin(request, { db: database(), now: Date.now() });
}
