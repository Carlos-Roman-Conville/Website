// node --test tests/   (Node 20+; no dependencies)
// Runs website/chat-widget.js against a tiny fake DOM and a fake chat service. No network.
// GL-25: after a booking, a failed reply must show the booking and must not offer "Try again".
// GL-41: one session at a time; the server's own error text reaches the visitor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const WIDGET = readFileSync(new URL("../website/chat-widget.js", import.meta.url), "utf-8");
const API = "https://chat.example.test";

/** Just enough DOM for the widget: a node tree, handlers, class lookups. */
function node(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, handlers: {},
    className: "", value: "", disabled: false, hidden: false, style: {}, scrollTop: 0, scrollHeight: 0,
    _text: "",
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { this._text = String(v); this.children = []; },
    get childNodes() { return this.children; },
    classList: { add(c) { n.className += " " + c; }, remove() {}, contains: (c) => n.className.split(/\s+/).includes(c) },
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; },
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(ev, fn) { (this.handlers[ev] ??= []).push(fn); },
    focus() {},
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : []))]; },
    querySelectorAll(sel) { const cls = sel.replace(/^\./, "").split(" ")[0]; return this.all().slice(1).filter((x) => x.classList?.contains(cls)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
  };
  return n;
}

function textNode(t) { return { textContent: String(t), parentNode: null, remove() {} }; }

const sse = (events) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), {
    status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" },
  });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Load the widget with a fake service. `session` and `stream` answer those routes. */
async function widget({ session, stream }) {
  const calls = [];
  const body = node("body");
  const store = new Map();
  const window = {
    location: { pathname: "/" },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    setTimeout, clearTimeout, TextDecoder, ReadableStream, AbortController, JSON, Date, Promise,
    document: {
      body, head: node("head"),
      createElement: node, createElementNS: (_ns, t) => node(t), createTextNode: textNode,
    },
    fetch: async (url, init) => {
      calls.push(url);
      if (url === `${API}/chat/config`) {
        return json(200, { ok: true, enabled: true, businessName: "Example Co", disclosure: "AI assistant.", opening: "Hi.", suggestions: [], turnstileSiteKey: null, maxMessageChars: 1000 });
      }
      if (url === `${API}/chat/session`) return session();
      if (url === `${API}/chat/stream`) return stream(JSON.parse(init.body));
      return json(404, {});
    },
  };
  window.window = window;
  vm.createContext(window);
  vm.runInContext(WIDGET, window);
  assert.equal(await window.CrcChat.start({ api: API }), true);
  const input = body.querySelector(".crcw-input");
  const type = async (text) => {
    input.value = text;
    input.handlers.keydown[0]({ key: "Enter", shiftKey: false, isComposing: false, preventDefault() {} });
    await new Promise((r) => setTimeout(r, 30));
  };
  const log = () => body.querySelector(".crcw-log");
  const buttons = () => log().all().filter((n) => n.tagName === "BUTTON").map((b) => b.textContent);
  return { window, calls, type, log, buttons };
}

const goodSession = () => json(200, { ok: true, token: "wc_tok", expiresAt: Date.now() + 3_600_000 });

test("opening the panel and sending at once starts one session, not two (GL-41)", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const w = await widget({ session: () => gate.then(goodSession), stream: () => sse([["delta", { text: "Hello." }], ["done", {}]]) });
  w.window.CrcChat.open(); // starts a session in the background
  const sending = w.type("hi"); // and the first message asks for one too
  await new Promise((r) => setTimeout(r, 5));
  release();
  await sending;
  assert.equal(w.calls.filter((u) => u.endsWith("/chat/session")).length, 1);
  assert.equal(w.calls.filter((u) => u.endsWith("/chat/stream")).length, 1);
});

test("the server's own error text reaches the visitor when a session is refused (GL-41)", async () => {
  const w = await widget({
    session: () => json(429, { ok: false, error: "rate_limit", message: "Too many chats from this connection. Please try again later." }),
    stream: () => assert.fail("no stream without a session"),
  });
  await w.type("hi");
  const error = w.log().querySelector(".crcw-error");
  assert.ok(error, "an error row is shown");
  assert.match(error.textContent, /Too many chats from this connection/);
  assert.ok(!w.buttons().includes("Try again"), "no retry offered on a rate limit");
});

test("a booking followed by a failed reply shows the booking and offers no Try again (GL-25)", async () => {
  const w = await widget({
    session: goodSession,
    stream: () => sse([
      ["status", { type: "status", tool: "book_appointment", text: "Booking that time…" }],
      ["booked", { type: "booked", label: "Tuesday, August 11 at 10:00 AM" }],
      ["error", { code: "reply_failed", retryable: false, message: "Sorry, I couldn't finish that reply, but what you asked for may already be done, so please don't send it again." }],
    ]),
  });
  await w.type("Book Tuesday at 10");
  const card = w.log().querySelector(".crcw-booked");
  assert.ok(card, "the booking is shown");
  assert.match(card.textContent, /Tuesday, August 11 at 10:00 AM/);
  assert.ok(w.log().querySelector(".crcw-error"), "the error is shown too");
  assert.ok(!w.buttons().includes("Try again"), "Try again would book twice");
  assert.ok(w.buttons().includes("Leave your details"));
});

/** An SSE response whose connection drops after these events (a proxy or mobile network cut). */
const sseThenDrop = (events) => {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  const body = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(text)); setTimeout(() => c.error(new TypeError("network error")), 5); },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
};

test("the stream drops after a booking: the booking is shown and Try again is not offered (review N3)", async () => {
  const w = await widget({
    session: goodSession,
    stream: () => sseThenDrop([
      ["status", { type: "status", tool: "book_appointment", text: "Booking that time…" }],
      ["booked", { type: "booked", label: "Tuesday, August 11 at 10:00 AM" }],
    ]),
  });
  await w.type("Book Tuesday at 10");
  const card = w.log().querySelector(".crcw-booked");
  assert.ok(card, "the booking is shown");
  assert.match(card.textContent, /Tuesday, August 11 at 10:00 AM/);
  assert.ok(w.log().querySelector(".crcw-error"), "the dropped connection is reported");
  assert.ok(!w.buttons().includes("Try again"));
});

test("the stream drops while a tool that changes something runs: no Try again (review N3)", async () => {
  const w = await widget({
    session: goodSession,
    stream: () => sseThenDrop([["status", { type: "status", tool: "capture_lead", text: "Saving your details…" }]]),
  });
  await w.type("Here are my details");
  assert.ok(w.log().querySelector(".crcw-error"));
  assert.ok(!w.buttons().includes("Try again"));
});

test("the stream drops after only a calendar check: Try again is still offered", async () => {
  const w = await widget({
    session: goodSession,
    stream: () => sseThenDrop([["status", { type: "status", tool: "check_availability", text: "Checking the calendar…" }]]),
  });
  await w.type("Any time Tuesday?");
  assert.ok(w.buttons().includes("Try again"));
});

test("an error the server marks retryable still offers Try again", async () => {
  const w = await widget({
    session: goodSession,
    stream: () => sse([["error", { code: "reply_failed", retryable: true, message: "Sorry, I couldn't answer just now." }]]),
  });
  await w.type("hi");
  assert.ok(w.buttons().includes("Try again"));
});
