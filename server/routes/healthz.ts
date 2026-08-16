import { json } from "@/lib/cloud/helpers";
import { getManifestHealth } from "../manifestHealth";

/**
 * Railway polls this to decide whether a deploy is healthy enough to promote,
 * so it doubles as the gate on WEBCAT manifest drift: when the build's bytes
 * disagree with the signed manifest and WEBCAT_VERIFY=enforce, this returns
 * 503, Railway keeps the previous deployment, and the drifting build never
 * serves traffic. See server/verifyManifest.ts.
 */
export async function GET() {
  const health = getManifestHealth();
  return health.healthy
    ? json(200, { ok: true, webcat: health.summary })
    : json(503, { ok: false, webcat: health.summary, problems: health.problems });
}
