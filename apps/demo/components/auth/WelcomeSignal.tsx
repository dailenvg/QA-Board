"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { WELCOME_PARAM } from "@/lib/auth/next-path";
import { emitSquiggy } from "@/lib/squiggy/events";

/**
 * The first page after signing in carries `?welcome=1`: Squiggy greets once
 * (the `signed-in` reaction) and the flag leaves the address, so a reload or a
 * shared link doesn't greet again. Renders nothing.
 */
export function WelcomeSignal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const welcome = params.has(WELCOME_PARAM);

  useEffect(() => {
    if (!welcome) return;
    emitSquiggy({ type: "signed-in" });
    const rest = new URLSearchParams(params);
    rest.delete(WELCOME_PARAM);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [welcome, params, pathname, router]);

  return null;
}
