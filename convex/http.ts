import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Two endpoints on the .convex.site domain:
 *   POST /track   the site records an event. Open, because a visitor has no login.
 *   GET  /stats   the dashboard reads aggregates, and only with the passphrase.
 *
 * The passphrase lives in a Convex environment variable and is compared here,
 * on the server. It is never shipped to the browser, so reading the page
 * source gets you nothing.
 *
 *   npx convex env set STATS_PASSPHRASE "something-only-you-know"
 */

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const preflight = httpAction(async (_ctx, request) =>
  new Response(null, { status: 204, headers: cors(request.headers.get("Origin")) }),
);

const track = httpAction(async (ctx, request) => {
  const headers = cors(request.headers.get("Origin"));
  try {
    // sendBeacon posts text/plain, which avoids a preflight.
    const body = await request.text();
    const d = JSON.parse(body || "{}");
    await ctx.runMutation(api.events.record, {
      event: String(d.event ?? ""),
      detail: String(d.detail ?? ""),
      session: String(d.sid ?? ""),
      device: String(d.device ?? ""),
      surface: String(d.surface ?? ""),
      source: String(d.source ?? ""),
    });
  } catch {
    // A visitor must never see analytics fail. Swallow and move on.
  }
  return new Response(null, { status: 204, headers });
});

const stats = httpAction(async (ctx, request) => {
  const headers = { ...cors(request.headers.get("Origin")), "Content-Type": "application/json" };
  const url = new URL(request.url);
  const expected = process.env.STATS_PASSPHRASE;

  if (!expected) {
    return new Response(JSON.stringify({ error: "no-passphrase-set" }), { status: 500, headers });
  }
  if (url.searchParams.get("key") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401, headers });
  }

  const days = Number(url.searchParams.get("days") ?? 30);
  const data = await ctx.runQuery(api.events.summary, { days: Number.isFinite(days) ? days : 30 });
  return new Response(JSON.stringify(data), { status: 200, headers });
});

const http = httpRouter();
http.route({ path: "/track", method: "POST", handler: track });
http.route({ path: "/track", method: "OPTIONS", handler: preflight });
http.route({ path: "/stats", method: "GET", handler: stats });
http.route({ path: "/stats", method: "OPTIONS", handler: preflight });

export default http;
