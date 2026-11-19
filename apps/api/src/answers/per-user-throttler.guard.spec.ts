import { PerUserThrottlerGuard } from "./per-user-throttler.guard";

// ThrottlerGuard's constructor requires options/storage/reflector, which we
// never exercise here — only the tracker-key logic is under test, so a bare
// prototype call (bypassing the constructor) is enough and avoids having to
// stand up real throttler infrastructure for a pure string-mapping check.
function trackerOf(guard: PerUserThrottlerGuard, req: Record<string, unknown>): Promise<string> {
  return (guard as unknown as { getTracker(req: Record<string, unknown>): Promise<string> }).getTracker(req);
}

describe("PerUserThrottlerGuard", () => {
  const guard = Object.create(PerUserThrottlerGuard.prototype) as PerUserThrottlerGuard;

  it("keys the rate limit by authenticated user id, not IP", async () => {
    const tracker = await trackerOf(guard, { user: { sub: "user-123" }, ip: "203.0.113.5" });
    expect(tracker).toBe("user:user-123");
  });

  it("gives two different authenticated users independent tracker keys", async () => {
    const a = await trackerOf(guard, { user: { sub: "user-a" }, ip: "203.0.113.5" });
    const b = await trackerOf(guard, { user: { sub: "user-b" }, ip: "203.0.113.5" });
    expect(a).not.toBe(b);
  });

  it("gives the same user the same tracker key even from a different IP", async () => {
    const a = await trackerOf(guard, { user: { sub: "user-123" }, ip: "203.0.113.5" });
    const b = await trackerOf(guard, { user: { sub: "user-123" }, ip: "198.51.100.9" });
    expect(a).toBe(b);
  });

  it("falls back to an IP-based key only if somehow reached without an authenticated user", async () => {
    const tracker = await trackerOf(guard, { ip: "203.0.113.5" });
    expect(tracker).toBe("ip:203.0.113.5");
  });
});
