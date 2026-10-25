import { json } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { clientView } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** `GET`: the shared project, its snapshots and every comment. */
export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  return asClient(request, token, "clientRead", async ({ services, share }) =>
    json(await clientView(services.store, share)),
  );
}
