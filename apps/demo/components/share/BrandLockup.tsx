import type { ClientBrand } from "@/lib/share/types";
import { BrandMark } from "./BrandMark";

interface BrandLockupProps {
  token: string;
  brand: ClientBrand;
}

/**
 * The start of a shared link's top bar: whose review this is (the company's
 * logo and name, or Squint's on an anonymous link) above "Shared review".
 * Phones keep the mark and read the words out.
 */
export function BrandLockup({ token, brand }: BrandLockupProps) {
  return (
    <span
      className="inline-flex min-h-11 min-w-0 items-center gap-3 pr-2 pl-2"
      data-testid="guest-brand"
    >
      <BrandMark token={token} brand={brand} />
      <span className="flex min-w-0 flex-col max-sm:sr-only">
        <span
          title={brand.name}
          className="max-w-48 truncate text-heading font-bold tracking-tight"
          data-testid="guest-brand-name"
        >
          {brand.name}
        </span>
        <span className="text-meta text-muted">Shared review</span>
      </span>
    </span>
  );
}
