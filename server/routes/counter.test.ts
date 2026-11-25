// @vitest-environment node
import { isIPv4 } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The analytics relay is the one place a visitor's IP is handed to anyone
 * other than us. These pin what reaches Umami through the real route, with
 * only `fetch` replaced: a `geo-hash` stand-in that keeps a rough location,
 * stays stable for a day so sessions work, and changes when the day's key is
 * thrown away. The Privacy page describes this to readers.
 */

const UMAMI = "https://umami.test";

let POST: (req: Request) => Promise<Response>;
let sent: { url: string; payload: Record<string, unknown> }[];

beforeAll(async () => {
  // The route reads its Umami config once, when the module loads.
  vi.stubEnv("UMAMI_API_KEY", "test-key");
  vi.stubEnv("UMAMI_WEBSITE_ID", "test-site");
  vi.stubEnv("UMAMI_API_CLIENT_ENDPOINT", UMAMI);
  // Before v1.0.0 the hashing levels refused to run without a salt.
  vi.stubEnv("IP_HASH_SALT", undefined);
  vi.resetModules();
  ({ POST } = await import("./counter"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function captureUmami() {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        payload: Record<string, unknown>;
      };
      sent.push({ url: String(url), payload: body.payload });
      return new Response("{}", { status: 200 });
    }),
  );
}

/**
 * `x-forwarded-for` is how the address arrives: `toWebRequest` has already
 * reduced it to the one entry our proxies vouch for.
 */
function eventFrom(ip: string): Request {
  return new Request("http://localhost/api/counter", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "test-agent",
    },
    body: JSON.stringify({
      hostname: "riskmapper.test",
      url: "/",
      name: "download_pdf",
    }),
  });
}

async function standInFor(ip: string): Promise<unknown> {
  const before = sent.length;
  const res = await POST(eventFrom(ip));
  expect(res.status).toBe(200);
  expect(sent).toHaveLength(before + 1);
  return sent[before]!.payload.ip;
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

/** Only for fully written-out IPv6, which is how the package formats it. */
function v6Groups(ip: string): number[] {
  const groups = ip.split(":").map((g) => parseInt(g, 16));
  expect(groups).toHaveLength(8);
  return groups;
}

/** 64 visitors in one /19 (203.0.96.0/19 holds the 203.0.113.0/24 test net). */
const NEIGHBOURS = Array.from({ length: 64 }, (_, i) => `203.0.113.${i}`);

describe("POST /api/counter", () => {
  it("forwards the event to Umami with a stand-in IP and no salt configured", async () => {
    captureUmami();
    const ip = await standInFor("203.0.113.77");

    expect(sent[0]!.url).toBe(`${UMAMI}/api/send`);
    expect(sent[0]!.payload).toMatchObject({
      website: "test-site",
      hostname: "riskmapper.test",
      url: "/",
      name: "download_pdf",
    });
    expect(typeof ip).toBe("string");
    expect(isIPv4(ip as string)).toBe(true);
  });

  it("keeps the first 19 bits of an IPv4 address and shuffles the rest", async () => {
    captureUmami();
    const standIns: string[] = [];
    for (const ip of NEIGHBOURS) standIns.push((await standInFor(ip)) as string);

    for (const standIn of standIns) {
      expect(isIPv4(standIn)).toBe(true);
      expect(v4ToInt(standIn) >>> 13).toBe(v4ToInt("203.0.113.0") >>> 13);
    }
    // A keyed permutation: no two visitors share a stand-in.
    expect(new Set(standIns).size).toBe(NEIGHBOURS.length);
    // Each address can land on itself by chance (1 in 8192); more than a
    // handful would mean the bits are not being shuffled at all.
    const unchanged = standIns.filter((s, i) => s === NEIGHBOURS[i]).length;
    expect(unchanged).toBeLessThan(4);
  });

  it("gives an address the same stand-in all day, and new ones the next day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    captureUmami();

    vi.setSystemTime(new Date("2026-11-24T09:00:00Z"));
    const morning: unknown[] = [];
    for (const ip of NEIGHBOURS) morning.push(await standInFor(ip));

    vi.setSystemTime(new Date("2026-11-24T23:59:00Z"));
    const evening: unknown[] = [];
    for (const ip of NEIGHBOURS) evening.push(await standInFor(ip));
    expect(evening).toEqual(morning);

    vi.setSystemTime(new Date("2026-11-25T00:01:00Z"));
    const nextDay: unknown[] = [];
    for (const ip of NEIGHBOURS) nextDay.push(await standInFor(ip));
    const kept = nextDay.filter((s, i) => s === morning[i]).length;
    expect(kept).toBeLessThan(4);
  });

  it("treats an IPv4-mapped IPv6 peer as the IPv4 address it wraps", async () => {
    // Node reports IPv4 peers this way if the server listens on `::`
    // (HOST=::), and `toWebRequest` falls back to the peer when there is no
    // proxy header. Before v1.0.0, `geo-hash` passed this form to Umami
    // unchanged.
    captureUmami();
    const ip = (await standInFor("::ffff:203.0.113.77")) as string;

    expect(ip).not.toContain("203.0.113.77");
    expect(isIPv4(ip)).toBe(true);
    expect(v4ToInt(ip) >>> 13).toBe(v4ToInt("203.0.113.77") >>> 13);
  });

  it("keeps the first 28 bits of an IPv6 address and zeroes the interface ID", async () => {
    captureUmami();
    const real = "2001:db8:1234:5678:9abc:def0:1234:5678";
    const ip = (await standInFor(real)) as string;

    const want = v6Groups(real);
    const got = v6Groups(ip);
    // 28 bits: the first group and the top 12 bits of the second.
    expect(got[0]).toBe(want[0]);
    expect(got[1]! >> 4).toBe(want[1]! >> 4);
    expect(got.slice(4)).toEqual([0, 0, 0, 0]);
  });

  it("leaves the IP out when the header is not an address", async () => {
    // Before v1.0.0 anything unparseable was forwarded as is.
    captureUmami();
    await standInFor("unknown");
    expect(sent[0]!.payload).not.toHaveProperty("ip");
  });
});
