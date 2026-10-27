import { LocationReporter } from "@pinpoint/widget";
import type { ReactNode } from "react";

/**
 * The sample site opts in to telling a framing review tool (Squint) which of
 * its pages is open, as a cooperating site would. Nothing happens unframed.
 */
export default function SandboxLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <LocationReporter />
    </>
  );
}
