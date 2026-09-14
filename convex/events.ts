import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const KINDS = ["view", "follow", "unlock", "watch"] as const;
type Kind = (typeof KINDS)[number];

/** One recorded event. The timestamp is set here, never trusted from a client. */
export const record = mutation({
  args: {
    event: v.string(),
    detail: v.string(),
    session: v.string(),
    device: v.string(),
    surface: v.string(),
    source: v.string(),
  },
  handler: async (ctx, a) => {
    if (!(KINDS as readonly string[]).includes(a.event)) return null;
    const cut = (s: string, n: number) => String(s ?? "").slice(0, n);
    await ctx.db.insert("events", {
      at: Date.now(),
      event: a.event,
      detail: cut(a.detail, 80),
      session: cut(a.session, 32),
      device: cut(a.device, 16),
      surface: cut(a.surface, 16),
      source: cut(a.source, 40),
    });
    return null;
  },
});

/**
 * Everything the dashboard draws, aggregated here so the browser never
 * receives raw traffic. Counts are per session: one visit that views, follows
 * and unlocks is one person at each step, not three events.
 */
export const summary = query({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const span = Math.min(365, Math.max(1, Math.floor(days)));
    const since = Date.now() - span * 86_400_000;

    const rows = await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.gte("at", since))
      .order("desc")
      .take(20_000);

    const totals: Record<Kind, number> = { view: 0, follow: 0, unlock: 0, watch: 0 };
    const seen = new Map<string, Set<string>>();
    const byDay: Record<string, Record<Kind, number>> = {};
    const films: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const surfaces: Record<string, number> = {};
    const sources: Record<string, number> = {};

    // Oldest first, so "first time this session did X" is the real first time.
    for (const r of [...rows].reverse()) {
      const kind = r.event as Kind;
      if (!(kind in totals)) continue;

      const day = new Date(r.at).toISOString().slice(0, 10);
      const key = `${r.session}|${kind}`;
      const bucket = seen.get(r.session) ?? new Set<string>();
      seen.set(r.session, bucket);

      if (!bucket.has(key)) {
        bucket.add(key);
        totals[kind]++;
        byDay[day] ??= { view: 0, follow: 0, unlock: 0, watch: 0 };
        byDay[day][kind]++;
        if (kind === "view") {
          devices[r.device || "?"] = (devices[r.device || "?"] ?? 0) + 1;
          surfaces[r.surface || "?"] = (surfaces[r.surface || "?"] ?? 0) + 1;
          sources[r.source || "?"] = (sources[r.source || "?"] ?? 0) + 1;
        }
      }

      // Film opens count every tap — one person opening three films is three.
      if (kind === "watch" && r.detail) films[r.detail] = (films[r.detail] ?? 0) + 1;
    }

    const recent = rows.slice(0, 120).map((r) => [
      new Date(r.at).toISOString().slice(5, 16).replace("T", " "),
      r.event,
      r.detail,
      r.device,
      r.surface,
      r.source,
    ]);

    return {
      days: span,
      totals,
      byDay,
      films,
      devices,
      surfaces,
      sources,
      recent,
      generated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
      truncated: rows.length >= 20_000,
    };
  },
});
