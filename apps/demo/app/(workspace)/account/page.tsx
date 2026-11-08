import { redirect } from "next/navigation";
import { ACCOUNT_PROFILE_HREF } from "@/lib/routes";

/** /account opens on its first section. */
export default function AccountPage() {
  redirect(ACCOUNT_PROFILE_HREF);
}
