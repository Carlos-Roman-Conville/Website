// node --test tests/   (Node 20+; no dependencies)
// Runs website/main.js against a tiny fake DOM and checks the contact form sends a Turnstile token
// made with the site key the chat service gives at /chat/config (GL-18). No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const MAIN = readFileSync(new URL("../website/main.js", import.meta.url), "utf-8");
const API = "https://chat.example.test";

function el(fields = {}) {
  return {
    value: "", textContent: "", className: "", disabled: false, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { this["on" + ev] = fn; },
    querySelector(sel) { return fields[sel.match(/name="(\w+)"/)?.[1]] ?? el(); },
    appendChild(c) { this.children.push(c); },
    getAttribute() { return null; },
    reset() {},
  };
}

function page({ siteKey }) {
  const fields = { website: el(), name: el(), email: el(), message: el() };
  fields.name.value = "Pat";
  fields.email.value = "pat@example.com";
  fields.message.value = "Hello";
  const ids = { "contact-form": el(fields), "cf-verify": el() };
  const calls = [];
  const renders = [];
  const turnstile = {
    render(_el, opts) { renders.push(opts); setTimeout(() => opts.callback("tok-123"), 0); return "w" + renders.length; },
    remove() {},
  };
  const window = {
    CRC_RECEPTIONIST_API: API,
    turnstile: undefined,
    document: {
      getElementById: (id) => (ids[id] ??= el()),
      querySelectorAll: () => [],
      createElement: () => el(),
      createTextNode: (t) => ({ textContent: t }),
      head: { appendChild(s) { window.turnstile = turnstile; s.onload(); } },
    },
    IntersectionObserver: class { observe() {} },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === `${API}/chat/config`) {
        return new Response(JSON.stringify({ ok: true, enabled: true, turnstileSiteKey: siteKey }));
      }
      return new Response(JSON.stringify({ ok: true, error: null }));
    },
    history: { pushState() {} },
    encodeURIComponent, Promise, JSON, setTimeout, Response,
  };
  window.window = window;
  vm.runInNewContext(MAIN, window);
  return { form: ids["contact-form"], calls, renders };
}

async function submit(p) {
  p.form.onsubmit({ preventDefault() {} });
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  return p.calls.find((c) => c.url === `${API}/contact`);
}

test("the contact form sends a Turnstile token made with the chat's site key", async () => {
  const p = page({ siteKey: "site-key-test" });
  const post = await submit(p);
  assert.ok(post, "POST /contact was sent");
  assert.equal(p.renders[0].sitekey, "site-key-test");
  assert.equal(JSON.parse(post.init.body).turnstileToken, "tok-123");
});

test("with no site key configured the form still posts (the server decides)", async () => {
  const p = page({ siteKey: null });
  const post = await submit(p);
  assert.ok(post, "POST /contact was sent");
  assert.equal(p.renders.length, 0);
  assert.equal(JSON.parse(post.init.body).turnstileToken, null);
});
