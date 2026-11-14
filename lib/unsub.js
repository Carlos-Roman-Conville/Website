// Shared code for the unsubscribe Pages Functions (GO-LIVE GL-4).
//
// Token format, identical to the Inbox repo's inbox/send/unsubscribe.py (make_token / read_token):
//   base64url(lowercased email, no padding) + "." + first 32 hex chars of HMAC-SHA256(secret, email)
// where `secret` is the text of Inbox's <data>/unsub_secret.key (a hex string, used as UTF-8 bytes, trimmed).
// On Cloudflare that text is the secret env var UNSUB_SECRET.
//
// Pending opt-outs live in the KV namespace bound as OPT_OUTS, one key per address: "optout:<email>", with the
// details in the key's metadata so one list() call returns everything. A key stays until the Inbox sync
// acknowledges it (no expiry), so nothing is lost while Rex's PC is off.

export const KEY_PREFIX = "optout:";

const enc = new TextEncoder();

function b64urlDecode(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison (lengths are not secret here).
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(secret, email) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(email))).slice(0, 32);
}

// The address in a valid token, else null. Mirrors read_token in inbox/send/unsubscribe.py.
export async function readToken(token, secret) {
  if (!secret || typeof token !== "string" || token.length > 2000) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const email = b64urlDecode(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!email || !email.includes("@") || email.length > 320) return null;
  return safeEqual(sig, await sign(secret, email)) ? email : null;
}

export async function recordOptOut(kv, email, via) {
  const meta = { email, at: new Date().toISOString(), via };
  await kv.put(KEY_PREFIX + email, JSON.stringify(meta), { metadata: meta });
  return meta;
}
