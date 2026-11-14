// node --test tests/   (Node 20+; no dependencies)
// Checks the unsubscribe Pages Functions against tokens made by the Inbox repo's Python code
// (tests/fixtures/unsub-tokens.json, made by Inbox tools/unsub_fixtures.py with a throwaway test secret).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readToken, KEY_PREFIX } from "../lib/unsub.js";
import * as unsub from "../functions/unsubscribe.js";
import * as api from "../functions/api/opt-outs.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/unsub-tokens.json", import.meta.url), "utf-8"));
const PULL_KEY = "test-pull-key-not-real";

class FakeKV {
  constructor() { this.m = new Map(); this.fail = false; }
  async put(k, v, opts = {}) { if (this.fail) throw new Error("kv down"); this.m.set(k, { v, metadata: opts.metadata }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = "", limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    return { keys: all.slice(0, limit).map((name) => ({ name, metadata: this.m.get(name).metadata })), list_complete: all.length <= limit };
  }
}

function env(kv = new FakeKV()) {
  return { UNSUB_SECRET: fx.secret, OPT_OUTS: kv, OPT_OUTS_PULL_KEY: PULL_KEY };
}
const url = (t) => `https://crc-solutions.org/unsubscribe?t=${encodeURIComponent(t)}`;
const oneClick = (t) => new Request(url(t), {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
});
const pull = (init = {}) => new Request("https://crc-solutions.org/api/opt-outs", {
  ...init, headers: { Authorization: `Bearer ${PULL_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
});

test("JS accepts every token the Python code made, with the same address", async () => {
  assert.ok(fx.good.length >= 4);
  for (const g of fx.good) assert.equal(await readToken(g.token, fx.secret), g.email);
});

test("JS rejects every token the Python code rejects", async () => {
  for (const b of fx.bad) assert.equal(await readToken(b, fx.secret), null, b);
  assert.equal(await readToken(fx.good[0].token, "a-different-secret"), null);
  assert.equal(await readToken(fx.good[0].token, ""), null);
  assert.equal(await readToken(undefined, fx.secret), null);
});

test("the secret is trimmed like Python's .strip()", async () => {
  assert.equal(await readToken(fx.good[0].token, fx.secret + "\n"), fx.good[0].email);
});

test("GET shows a confirmation page and records nothing", async () => {
  const e = env();
  const r = await unsub.onRequestGet({ request: new Request(fx.good[0].link), env: e });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<form method="post"/);
  assert.match(html, /sam@example\.com/);
  assert.doesNotMatch(html, /<script/i);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal(r.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(e.OPT_OUTS.m.size, 0);
});

test("GET escapes the address in the page", async () => {
  const g = fx.good.find((x) => x.email.includes("'"));
  const html = await (await unsub.onRequestGet({ request: new Request(url(g.token)), env: env() })).text();
  assert.ok(html.includes("o&#39;brien@example.org"));
});

test("GET with a bad token is a polite 400", async () => {
  for (const b of fx.bad) {
    const r = await unsub.onRequestGet({ request: new Request(url(b)), env: env() });
    assert.equal(r.status, 400);
    assert.match(await r.text(), /not valid/);
  }
});

test("one-click POST (RFC 8058) opts out and answers 200", async () => {
  const e = env();
  const r = await unsub.onRequestPost({ request: oneClick(fx.good[1].token), env: e });
  assert.equal(r.status, 200);
  const rec = e.OPT_OUTS.m.get(KEY_PREFIX + fx.good[1].email);
  assert.equal(rec.metadata.email, fx.good[1].email);
  assert.equal(rec.metadata.via, "one_click");
});

test("the page's button (form POST with t field) opts out", async () => {
  const e = env();
  const req = new Request("https://crc-solutions.org/unsubscribe", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ t: fx.good[3].token }).toString(),
  });
  const r = await unsub.onRequestPost({ request: req, env: e });
  assert.equal(r.status, 200);
  assert.equal(e.OPT_OUTS.m.get(KEY_PREFIX + fx.good[3].email).metadata.via, "page");
});

test("POST with a bad token records nothing", async () => {
  const e = env();
  const r = await unsub.onRequestPost({ request: oneClick("garbage.0000"), env: e });
  assert.equal(r.status, 400);
  assert.equal(e.OPT_OUTS.m.size, 0);
});

test("missing secret, missing KV or KV down is a 503, never a false success", async () => {
  const t = fx.good[0].token;
  assert.equal((await unsub.onRequestPost({ request: oneClick(t), env: { ...env(), UNSUB_SECRET: undefined } })).status, 503);
  assert.equal((await unsub.onRequestPost({ request: oneClick(t), env: { ...env(), OPT_OUTS: undefined } })).status, 503);
  const kv = new FakeKV(); kv.fail = true;
  assert.equal((await unsub.onRequestPost({ request: oneClick(t), env: env(kv) })).status, 503);
});

test("pull needs the bearer key; 503 when not configured", async () => {
  const e = env();
  const bare = new Request("https://crc-solutions.org/api/opt-outs");
  assert.equal((await api.onRequestGet({ request: bare, env: e })).status, 401);
  const wrong = new Request("https://crc-solutions.org/api/opt-outs", { headers: { Authorization: "Bearer nope" } });
  assert.equal((await api.onRequestGet({ request: wrong, env: e })).status, 401);
  const unsubSecretAsKey = new Request("https://crc-solutions.org/api/opt-outs", { headers: { Authorization: `Bearer ${fx.secret}` } });
  assert.equal((await api.onRequestGet({ request: unsubSecretAsKey, env: e })).status, 401);
  assert.equal((await api.onRequestGet({ request: pull(), env: { ...e, OPT_OUTS_PULL_KEY: "" } })).status, 503);
});

test("pull lists pending opt-outs until acknowledged, then they are gone", async () => {
  const e = env();
  for (const g of fx.good.slice(0, 2)) await unsub.onRequestPost({ request: oneClick(g.token), env: e });
  await unsub.onRequestPost({ request: oneClick(fx.good[0].token), env: e });       // clicked twice: still one entry
  let body = await (await api.onRequestGet({ request: pull(), env: e })).json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.opt_outs.map((o) => o.email).sort(), [fx.good[0].email, fx.good[1].email].sort());
  assert.equal(body.data.more, false);
  body = await (await api.onRequestGet({ request: pull(), env: e })).json();        // not acked: delivered again
  assert.equal(body.data.opt_outs.length, 2);
  const id = body.data.opt_outs[0].id;
  const ack = await api.onRequestPost({ request: pull({ method: "POST", body: JSON.stringify({ ack: [id] }) }), env: e });
  assert.deepEqual(await ack.json(), { ok: true, data: { acked: 1 } });
  body = await (await api.onRequestGet({ request: pull(), env: e })).json();
  assert.equal(body.data.opt_outs.length, 1);
  assert.notEqual(body.data.opt_outs[0].id, id);
});

test("ack refuses anything that is not an opt-out id", async () => {
  const e = env();
  e.OPT_OUTS.m.set("other:thing", { v: "x" });
  for (const b of ['{"ack": ["other:thing"]}', '{"ack": "optout:a@example.com"}', "not json", "{}"]) {
    const r = await api.onRequestPost({ request: pull({ method: "POST", body: b }), env: e });
    assert.equal(r.status, 400, b);
  }
  assert.ok(e.OPT_OUTS.m.has("other:thing"));
  const noKey = new Request("https://crc-solutions.org/api/opt-outs", { method: "POST", body: '{"ack": []}' });
  assert.equal((await api.onRequestPost({ request: noKey, env: e })).status, 401);
});
