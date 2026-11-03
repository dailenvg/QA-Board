import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { isResetTokenUsable } from "@/lib/auth/password-reset";
import { database } from "@/lib/db/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

interface ResetTokenPageProps {
  params: Promise<{ token: string }>;
}

async function linkUsable(token: string): Promise<boolean> {
  const db = database();
  return db ? isResetTokenUsable(await db, token, Date.now()) : false;
}

/** The emailed link. An unusable one shows the expired state straight away. */
export default async function ResetTokenPage({ params }: ResetTokenPageProps) {
  const { token } = await params;
  return <ResetPasswordForm token={token} usable={await linkUsable(token)} />;
}
