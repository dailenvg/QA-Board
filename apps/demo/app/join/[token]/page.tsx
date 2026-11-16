import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JoinFlow } from "@/components/auth/JoinFlow";
import { joinFlagMessage } from "@/lib/auth/form-flags";
import { getSession } from "@/lib/auth/guards";
import { single, type SearchParams } from "@/lib/search-params";
import { readJoinPage } from "@/lib/workspace/members/join-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your invite",
  robots: { index: false, follow: false },
};

interface JoinPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * An invite's link, from its email or copied by hand: what it's for and the
 * way to join, read for whoever opened it. Opening it never accepts it. An
 * invitee who's already in goes straight to the Overview.
 */
export default async function JoinPage({ params, searchParams }: JoinPageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  const session = await getSession();
  const state = await readJoinPage(token, session);
  if (state.kind === "member") redirect("/");
  return (
    <JoinFlow
      token={token}
      state={state}
      signedIn={session !== null}
      initialError={joinFlagMessage(single(error))}
    />
  );
}
