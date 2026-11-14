// /api/opt-outs  (GO-LIVE GL-4): how the Inbox sync on Rex's PC collects opt-outs made on the website.
//
//   GET  /api/opt-outs                      -> 200 {"ok": true, "data": {"opt_outs": [{id, email, at, via}], "more": bool}}
//   POST /api/opt-outs  {"ack": [id, ...]}  -> 200 {"ok": true, "data": {"acked": n}}
//
// Both need "Authorization: Bearer <OPT_OUTS_PULL_KEY>" (a Pages secret, separate from UNSUB_SECRET). Without the
// right key: 401. With the key or the KV binding missing on Cloudflare: 503 (never open).
// An opt-out is listed on every GET until it is acknowledged, then deleted: the CRM holds it from then on.
// Acknowledge only after the CRM has recorded it, so each one is delivered at least once; recording twice is harmless
// (record_opt_out is idempotent on the CRM side).

import { KEY_PREFIX, safeEqual } from "../../lib/unsub.js";

const PAGE = 100;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

function guard(request, env) {
  if (!env.OPT_OUTS_PULL_KEY || !env.OPT_OUTS) return json(503, { ok: false, message: "not configured" });
  const auth = request.headers.get("Authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!given || !safeEqual(given, env.OPT_OUTS_PULL_KEY.trim())) return json(401, { ok: false, message: "unauthorized" });
  return null;
}

export async function onRequestGet({ request, env }) {
  const denied = guard(request, env);
  if (denied) return denied;
  const res = await env.OPT_OUTS.list({ prefix: KEY_PREFIX, limit: PAGE });
  const opt_outs = res.keys.map((k) => ({
    id: k.name,
    email: (k.metadata && k.metadata.email) || k.name.slice(KEY_PREFIX.length),
    at: (k.metadata && k.metadata.at) || "",
    via: (k.metadata && k.metadata.via) || "",
  }));
  return json(200, { ok: true, data: { opt_outs, more: !res.list_complete } });
}

export async function onRequestPost({ request, env }) {
  const denied = guard(request, env);
  if (denied) return denied;
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, message: "body must be JSON: {\"ack\": [id, ...]}" });
  }
  const ids = Array.isArray(body && body.ack) ? body.ack : null;
  if (!ids || ids.length > PAGE || !ids.every((i) => typeof i === "string" && i.startsWith(KEY_PREFIX))) {
    return json(400, { ok: false, message: `ack must be a list of up to ${PAGE} ids from GET` });
  }
  await Promise.all(ids.map((id) => env.OPT_OUTS.delete(id)));
  return json(200, { ok: true, data: { acked: ids.length } });
}
