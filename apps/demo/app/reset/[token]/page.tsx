import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { isResetTokenUsable } from "@/lib/auth/password-reset";
import { resetPasswordFlagMessage } from "@/lib/auth/form-flags";
import { database } from "@/lib/db/database";
import { single, type SearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

interface ResetTokenPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

async function linkUsable(token: string): Promise<boolean> {
  const db = database();
  return db ? isResetTokenUsable(await db, token, Date.now()) : false;
}

/** The emailed link. An unusable one shows the expired state straight away. */
export default async function ResetTokenPage({ params, searchParams }: ResetTokenPageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  return (
    <ResetPasswordForm
      token={token}
      usable={await linkUsable(token)}
      initialError={resetPasswordFlagMessage(single(error))}
    />
  );
}
