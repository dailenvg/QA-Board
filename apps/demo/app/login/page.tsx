import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { loginFlagMessage, loginNotice } from "@/lib/auth/form-flags";
import { getSession } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/auth/next-path";
import { single, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

interface LoginPageProps {
  searchParams: Promise<SearchParams>;
}

/** Sign in. Already signed in: straight on to where the browser was going. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = safeNextPath(single(params.next));
  if (await getSession()) redirect(next);
  return (
    <LoginForm
      next={next}
      notice={loginNotice({
        reset: single(params.reset),
        email: single(params.email),
        signedOut: single(params["signed-out"]),
      })}
      initialError={loginFlagMessage(single(params.error), single(params.retry))}
    />
  );
}
