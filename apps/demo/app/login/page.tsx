import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSession } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Sign in. Already signed in: straight on to where the browser was going. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = safeNextPath(single(params.next));
  if (await getSession()) redirect(next);
  return <LoginForm next={next} passwordChanged={single(params.reset) === "done"} />;
}
