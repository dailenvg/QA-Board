import type { Metadata } from "next";
import { EmailChangeConfirm } from "@/components/account/EmailChangeConfirm";
import { isEmailChangeUsable } from "@/lib/account/email-change";
import { emailChangeFlagMessage } from "@/lib/auth/form-flags";
import { database } from "@/lib/db/database";
import { single, type SearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your new email",
  robots: { index: false, follow: false },
};

interface EmailChangePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

async function linkUsable(token: string): Promise<boolean> {
  const db = database();
  return db ? isEmailChangeUsable(await db, token, Date.now()) : false;
}

/**
 * The link mailed to the new address. Opening it only reads: mail scanners
 * open links too, so the change waits for the page's button (a POST). An
 * unusable link shows the expired state straight away.
 */
export default async function EmailChangePage({ params, searchParams }: EmailChangePageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  return (
    <EmailChangeConfirm
      token={token}
      usable={await linkUsable(token)}
      initialError={emailChangeFlagMessage(single(error))}
    />
  );
}
