import type { MembersData } from "@/lib/workspace/members/members-data";
import { PeopleCard } from "./PeopleCard";

/** The Members section: who's in the workspace, as the signed-in user may see them. */
export function MembersSettings({ data }: { data: MembersData }) {
  return (
    <div className="flex flex-col gap-4" data-testid="members-settings">
      <PeopleCard data={data} />
    </div>
  );
}
