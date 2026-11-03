import type { Metadata } from "next";
import { ResetRequestForm } from "@/components/auth/ResetRequestForm";
import { resetRequestFlagMessage } from "@/lib/auth/form-flags";
import { single, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

interface ResetPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ResetPage({ searchParams }: ResetPageProps) {
  const params = await searchParams;
  return (
    <ResetRequestForm
      initialSent={single(params.sent) === "1"}
      initialError={resetRequestFlagMessage(single(params.error))}
    />
  );
}
