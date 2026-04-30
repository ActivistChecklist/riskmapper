import { json } from "@/lib/cloud/helpers";

export const runtime = "nodejs";

export async function GET() {
  return json(200, { ok: true });
}
