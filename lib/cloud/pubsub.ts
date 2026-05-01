/**
 * In-process pub/sub for matrix update fan-out.
 *
 * One subscriber set per recordId. When the client POSTs an update, the
 * route handler `publish()`es it, and every connected SSE listener for
 * that record receives it on its open `Response` stream.
 *
 * Single-process only. For horizontal scale, swap the in-memory `Map` for
 * a Redis pubsub backend (same `subscribe` / `publish` shape) — same
 * pattern as `rateLimit.ts`.
 *
 * Mounted on `globalThis` so Next.js dev-mode hot reload doesn't orphan
 * subscribers across module re-evaluations.
 */

export type UpdateEvent = {
  seq: number;
  ciphertext: string;
  clientId: string;
};

type Listener = (e: UpdateEvent) => void;

const g = globalThis as typeof globalThis & {
  _riskmatrixPubSub?: Map<string, Set<Listener>>;
};

function getRegistry(): Map<string, Set<Listener>> {
  if (!g._riskmatrixPubSub) {
    g._riskmatrixPubSub = new Map();
  }
  return g._riskmatrixPubSub;
}

export function subscribe(recordId: string, listener: Listener): () => void {
  const reg = getRegistry();
  let set = reg.get(recordId);
  if (!set) {
    set = new Set();
    reg.set(recordId, set);
  }
  set.add(listener);
  return () => {
    const cur = reg.get(recordId);
    if (!cur) return;
    cur.delete(listener);
    if (cur.size === 0) reg.delete(recordId);
  };
}

export function publish(recordId: string, event: UpdateEvent): void {
  const set = getRegistry().get(recordId);
  if (!set) return;
  // Snapshot before iteration — listeners that unsubscribe themselves
  // during dispatch shouldn't perturb the loop.
  for (const l of [...set]) {
    try {
      l(event);
    } catch {
      // A misbehaving listener mustn't break fan-out for the others.
    }
  }
}

/** Test-only. Drops every subscriber for every record. */
export function __resetPubSubForTests(): void {
  g._riskmatrixPubSub = new Map();
}
