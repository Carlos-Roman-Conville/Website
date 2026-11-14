// /unsubscribe?t=<token>  (GO-LIVE GL-4; runs on Cloudflare, so it works while Rex's PC is off)
//
// GET  shows a confirmation page with one button. It never opts anyone out by itself: mail scanners and link
//      previewers fetch every link in a message, and a GET that unsubscribed would opt people out who never clicked.
// POST opts the address out and answers 200. This is both the page's button and RFC 8058 one-click
//      (List-Unsubscribe-Post: List-Unsubscribe=One-Click, which mail providers POST to the List-Unsubscribe URL).
//
// Bindings (Pages project > Settings): secret UNSUB_SECRET (same text as Inbox's unsub_secret.key) and KV namespace
// OPT_OUTS. The Inbox sync pulls the stored opt-outs into the CRM (functions/api/opt-outs.js).
// No cookies, no analytics, no third-party anything.

import { readToken, recordOptOut } from "../lib/unsub.js";

const CONTACT = "carlos@crc-solutions.org";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function page(status, title, bodyHtml) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} | CRC Solutions</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #050807;
         color: #E8EDE9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 480px; width: 100%; background: #0B1110; border: 1px solid rgba(95, 127, 134, 0.35);
          border-radius: 8px; padding: 36px 32px; text-align: center; }
  .logo { height: 32px; margin-bottom: 28px; }
  h1 { font-size: 26px; font-weight: 700; color: #F2F5F3; margin-bottom: 14px; }
  p { font-size: 16px; color: #A9B5AF; line-height: 1.7; margin-bottom: 14px; }
  strong { color: #E8EDE9; word-break: break-all; }
  button, .btn { display: inline-block; background: #A7F12B; color: #050807; padding: 14px 32px; border: 0;
                 border-radius: 6px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
                 text-decoration: none; margin-top: 10px; }
  button:hover, .btn:hover { background: #C8FF3D; }
  button:focus-visible, .btn:focus-visible, a:focus-visible { outline: 2px solid #A7F12B; outline-offset: 3px; }
  a { color: #A7F12B; }
  .small { font-size: 14px; margin-top: 18px; margin-bottom: 0; }
</style>
</head>
<body>
<main class="card">
<img class="logo" src="/images/logo-wordmark.png" alt="CRC Solutions">
${bodyHtml}
</main>
</body>
</html>`;
  return new Response(html, { status, headers: HEADERS });
}

function badLink() {
  return page(400, "Link not valid", `<h1>This link is not valid</h1>
<p>The unsubscribe link may have been cut off or changed. Please use the full link from the email,
or write to <a href="mailto:${CONTACT}">${CONTACT}</a> and we will take you off our list.</p>`);
}

function notNow() {
  return page(503, "Please try again", `<h1>We could not record that just now</h1>
<p>Please try the link again in a few minutes, or write to <a href="mailto:${CONTACT}">${CONTACT}</a>
and we will take you off our list.</p>`);
}

// The token is in the URL (?t=); the confirmation form also sends it as a field. Bodies are tiny, so read as text.
async function readPost(request) {
  let body = "";
  try {
    body = (await request.text()).slice(0, 4000);
  } catch {
    body = "";
  }
  const form = new URLSearchParams(body);
  const token = new URL(request.url).searchParams.get("t") || form.get("t") || "";
  const oneClick = form.get("List-Unsubscribe") === "One-Click";
  return { token, oneClick };
}

export async function onRequestGet({ request, env }) {
  if (!env.UNSUB_SECRET) return notNow();
  const token = new URL(request.url).searchParams.get("t") || "";
  const email = await readToken(token, env.UNSUB_SECRET);
  if (!email) return badLink();
  return page(200, "Unsubscribe", `<h1>Unsubscribe?</h1>
<p>Stop all email from CRC Solutions to <strong>${esc(email)}</strong>.</p>
<form method="post" action="/unsubscribe?t=${esc(encodeURIComponent(token))}">
<input type="hidden" name="t" value="${esc(token)}">
<button type="submit">Unsubscribe</button>
</form>
<p class="small">Changed your mind? Just close this page.</p>`);
}

export async function onRequestPost({ request, env }) {
  if (!env.UNSUB_SECRET || !env.OPT_OUTS) return notNow();
  const { token, oneClick } = await readPost(request);
  const email = await readToken(token, env.UNSUB_SECRET);
  if (!email) return badLink();
  try {
    await recordOptOut(env.OPT_OUTS, email, oneClick ? "one_click" : "page");
  } catch {
    return notNow();
  }
  return page(200, "Unsubscribed", `<h1>You are unsubscribed</h1>
<p><strong>${esc(email)}</strong> will not get more email from CRC Solutions.</p>
<p class="small"><a href="/">crc-solutions.org</a></p>`);
}
