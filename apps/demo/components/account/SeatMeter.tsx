import type { Seats } from "@/lib/workspace/members/seats";
import { GrowBar } from "../overview/bento/GrowBar";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.invite.seats;

interface SeatMeterProps {
  seats: Seats;
  /** Active people, the owner included: the People list's count. */
  members: number;
  /** Open invites that haven't expired: the ones holding a seat. */
  invited: number;
}

/**
 * Seats used of the workspace's limit (4b.2): words, then a bar in a meter
 * for assistive tech. The brand's blue while there's room; the warning's
 * amber once full or over (nothing is broken, so never red).
 */
export function SeatMeter({ seats, members, invited }: SeatMeterProps) {
  const full = seats.used >= seats.limit;
  const share = seats.limit > 0 ? Math.min(1, seats.used / seats.limit) : 1;
  return (
    <div className="flex flex-col gap-3" data-testid="seat-meter" data-full={full || undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-body text-muted">
          <span className="text-title font-bold text-ink tabular-nums">{seats.used}</span>{" "}
          {COPY.used(seats.limit)}
        </p>
        <p className="text-meta text-muted tabular-nums" data-testid="seat-breakdown">
          {COPY.breakdown(members, invited)}
        </p>
      </div>
      {/* GrowBar is aria-hidden: the meter carries the value, under a short name read once. */}
      <div
        role="meter"
        aria-label={COPY.name}
        aria-valuemin={0}
        aria-valuemax={seats.limit}
        aria-valuenow={Math.min(seats.used, seats.limit)}
        aria-valuetext={COPY.valueText(seats.used, seats.limit)}
      >
        <GrowBar share={share} fill={full ? "bg-warning" : "bg-brand-text"} height="h-3" />
      </div>
    </div>
  );
}
