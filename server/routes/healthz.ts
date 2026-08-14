import { json } from "@/lib/cloud/helpers";


export async function GET() {
  return json(200, { ok: true });
}
