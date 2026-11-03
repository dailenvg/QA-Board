import type { Metadata } from "next";
import { ResetRequestForm } from "@/components/auth/ResetRequestForm";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ResetPage() {
  return <ResetRequestForm />;
}
