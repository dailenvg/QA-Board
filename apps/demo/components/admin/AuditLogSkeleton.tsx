import { Skeleton } from "../ui/Skeleton";
import { ADMIN_COPY } from "./admin-copy";

/** The audit log while it loads: the filters card, then a few entries, in their places. */
export function AuditLogSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4"
      data-testid="audit-log-skeleton"
    >
      <span className="sr-only">{ADMIN_COPY.audit.loading}</span>
      <div className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-seg sm:p-6">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-sm" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-11 w-full rounded-field" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-line rounded-card bg-card shadow-seg">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-32 max-sm:hidden" />
            </div>
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
