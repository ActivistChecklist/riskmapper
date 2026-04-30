/**
 * Tiny utilities shared across the `app/api/matrix/**` Route Handlers.
 * Kept narrow on purpose — anything bigger belongs in its own module.
 */

export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function validCiphertext(value: unknown): value is string {
  // Accept any v1./v2. envelope-shaped string; the server doesn't decrypt.
  return typeof value === "string" && value.length >= 4 && /^v\d+\./.test(value);
}

export function isPlausibleId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

export function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === 11000
  );
}

export function internalError(err: unknown): Response {
  // Log a redacted message; never the body.
  const message = err instanceof Error ? err.message : "unknown";
  console.error("[risk-matrix-api] internal error:", message);
  return jsonError(500, "internal");
}
