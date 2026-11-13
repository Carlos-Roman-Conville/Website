/*
 * CRC Solutions website chat widget (Receptionist web chat).
 *
 * - Health-gated: no launcher unless the chat service answers GET /chat/config (GO-LIVE GL-1).
 * - Streams replies (POST /chat/stream, server-sent events), shows tool progress, booking
 *   times as buttons, quick replies, and a "talk to a person" form (POST /chat/handoff).
 * - Accessible: dialog with focus management, Escape to close, screen-reader announcements of
 *   whole replies (not every streamed word), 44px targets, reduced motion, works at 320px.
 * - CSP-friendly: no inline script, no eval, styles in chat-widget.css, model text is only
 *   ever inserted as text, never as HTML.
 * - The conversation follows the visitor across pages (sessionStorage, this tab only).
 *
 * Start it from main.js: CrcChat.start({ api: 'https://chat.example.org', privacyUrl: 'privacy.html' })
 */
(function () {
  'use strict';

  var STORE_KEY = 'crc_chat_v2';
  var MAX_STORED = 60;

  var opts = { api: '', privacyUrl: 'privacy.html', fallbackEmail: '' };
  var cfg = null; // from GET /chat/config
  var state = { token: null, expiresAt: 0, messages: [], open: false, email: null, busy: false, handoffDone: false };
  var el = {}; // DOM references
  var turnstileReady = null;

  /* ---------------- storage ---------------- */

  function load() {
    try {
      var raw = window.sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.expiresAt > Date.now()) {
        state.token = data.token;
        state.expiresAt = data.expiresAt;
        state.messages = Array.isArray(data.messages) ? data.messages : [];
        state.open = !!data.open;
        state.email = data.email || null;
        state.handoffDone = !!data.handoffDone;
      }
    } catch (e) { /* storage blocked: the chat still works for this page */ }
  }

  function save() {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({
        token: state.token,
        expiresAt: state.expiresAt,
        messages: state.messages.slice(-MAX_STORED),
        open: state.open,
        email: state.email,
        handoffDone: state.handoffDone
      }));
    } catch (e) { /* ignore */ }
  }

  function clearConversation() {
    state.token = null;
    state.expiresAt = 0;
    state.messages = [];
    state.email = null;
    state.handoffDone = false;
    try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------------- DOM helpers ---------------- */

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  /**
   * Model and visitor text as text nodes with line breaks; never innerHTML. The model is told
   * not to use markdown, but if it writes **bold** that becomes <strong> (built as nodes), and
   * a leading "# " heading marker is dropped, so no stray symbols reach the visitor.
   */
  function setText(node, text) {
    node.textContent = '';
    String(text).split('\n').forEach(function (line, i) {
      if (i > 0) node.appendChild(document.createElement('br'));
      line = line.replace(/^#{1,6}\s+/, '');
      var parts = line.split('**');
      parts.forEach(function (part, j) {
        if (!part) return;
        var bold = j % 2 === 1 && j < parts.length - 1;
        if (bold) {
          var strong = document.createElement('strong');
          strong.textContent = part;
          node.appendChild(strong);
        } else {
          node.appendChild(document.createTextNode(part));
        }
      });
    });
  }

  function announce(text) {
    // Clear then set, so the same text twice is still read.
    el.live.textContent = '';
    window.setTimeout(function () { el.live.textContent = text; }, 50);
  }

  function scrollToEnd() {
    el.log.scrollTop = el.log.scrollHeight;
  }

  function icon(name) {
    var paths = {
      chat: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
      close: 'M6 6l12 12M18 6L6 18',
      send: 'M3 11.5L21 3l-8.5 18-2.2-7.3L3 11.5z',
      up: 'M7 10v10H4V10h3zm2 10h8.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 19 9h-5l.8-4.2A1.5 1.5 0 0 0 13.3 3L9 9.5V20z',
      down: 'M17 14V4h3v10h-3zm-2-10H6.5a2 2 0 0 0-2 1.6l-1.4 7A2 2 0 0 0 5 15h5l-.8 4.2a1.5 1.5 0 0 0 1.5 1.8L15 14.5V4z'
    };
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', paths[name]);
    svg.appendChild(p);
    return svg;
  }

  /* ---------------- network ---------------- */

  function api(path) { return opts.api.replace(/\/$/, '') + path; }

  function postJson(path, body) {
    return fetch(api(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        data._status = res.status;
        return data;
      });
    });
  }

  function loadTurnstile() {
    if (turnstileReady) return turnstileReady;
    turnstileReady = new Promise(function (resolve, reject) {
      if (window.turnstile) return resolve(window.turnstile);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { resolve(window.turnstile); };
      s.onerror = function () { reject(new Error('turnstile_load_failed')); };
      document.head.appendChild(s);
    });
    return turnstileReady;
  }

  function turnstileToken() {
    if (!cfg || !cfg.turnstileSiteKey) return Promise.resolve(null);
    return loadTurnstile().then(function (ts) {
      return new Promise(function (resolve, reject) {
        el.verify.textContent = '';
        ts.render(el.verify, {
          sitekey: cfg.turnstileSiteKey,
          appearance: 'interaction-only',
          action: 'chat_open',
          callback: resolve,
          'error-callback': function () { reject(new Error('turnstile_failed')); }
        });
      });
    });
  }

  function ensureSession() {
    if (state.token && state.expiresAt > Date.now() + 60000) return Promise.resolve(state.token);
    return turnstileToken().then(function (tsToken) {
      return postJson('/chat/session', { turnstileToken: tsToken, page: location.pathname });
    }).then(function (data) {
      if (!data.token) throw new Error(data.error || 'session_failed');
      state.token = data.token;
      state.expiresAt = data.expiresAt;
      save();
      return state.token;
    });
  }

  /** POST /chat/stream and dispatch server-sent events to `on`. */
  function streamReply(message, on) {
    return fetch(api('/chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.token, message: message, email: state.email }),
      credentials: 'omit'
    }).then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (!res.ok || type.indexOf('text/event-stream') === -1) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          var err = new Error(data.error || 'http_' + res.status);
          err.status = res.status;
          err.userMessage = data.message;
          throw err;
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function dispatch(block) {
        var event = 'message';
        var data = '';
        block.split('\n').forEach(function (line) {
          if (line.indexOf('event:') === 0) event = line.slice(6).trim();
          else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
        });
        if (!data) return;
        try { on(event, JSON.parse(data)); } catch (e) { /* ignore a malformed event */ }
      }
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { if (buffer.trim()) dispatch(buffer); return; }
          buffer += decoder.decode(r.value, { stream: true });
          var idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            dispatch(buffer.slice(0, idx));
            buffer = buffer.slice(idx + 2);
          }
          return pump();
        });
      }
      return pump();
    });
  }

  /* ---------------- rendering ---------------- */

  function bubble(role, text) {
    var b = h('div', { className: 'crcw-msg crcw-' + role });
    var body = h('div', { className: 'crcw-bubble' });
    setText(body, text);
    var who = h('span', { className: 'crcw-sr', text: role === 'user' ? 'You said: ' : 'Assistant: ' });
    b.appendChild(who);
    b.appendChild(body);
    el.log.appendChild(b);
    scrollToEnd();
    return { row: b, body: body };
  }

  function renderStored() {
    el.log.textContent = '';
    greeting();
    state.messages.forEach(function (m) {
      if (m.kind === 'booked') bookedCard(m.text, true);
      else bubble(m.role, m.text);
    });
    scrollToEnd();
  }

  function greeting() {
    var row = bubble('bot', cfg.disclosure + '\n' + cfg.opening);
    row.row.classList.add('crcw-greeting');
    if (state.messages.length === 0) chips(cfg.suggestions || [], false);
  }

  function clearChips() {
    var old = el.log.querySelectorAll('.crcw-chips');
    for (var i = 0; i < old.length; i++) old[i].remove();
  }

  function chips(list, withHandoff) {
    clearChips();
    var items = (list || []).slice(0, 3);
    if (!items.length && !withHandoff) return;
    var wrap = h('div', { className: 'crcw-chips', role: 'group', 'aria-label': 'Suggested replies' });
    items.forEach(function (label) {
      wrap.appendChild(h('button', { type: 'button', className: 'crcw-chip', text: label, onclick: function () { send(label); } }));
    });
    if (withHandoff && !state.handoffDone) {
      wrap.appendChild(h('button', {
        type: 'button', className: 'crcw-chip crcw-chip-strong',
        text: 'Leave my details for ' + (cfg.handoffName || 'the team'),
        onclick: showHandoff
      }));
    }
    el.log.appendChild(wrap);
    scrollToEnd();
  }

  function slotButtons(slots) {
    if (!slots || !slots.length) return;
    var wrap = h('div', { className: 'crcw-slots', role: 'group', 'aria-label': 'Open times' });
    slots.slice(0, 6).forEach(function (s) {
      wrap.appendChild(h('button', {
        type: 'button', className: 'crcw-slot', text: s.label,
        onclick: function () { wrap.remove(); send('I’d like ' + s.label + '.'); }
      }));
    });
    el.log.appendChild(wrap);
    scrollToEnd();
  }

  function bookedCard(label, restoring) {
    var card = h('div', { className: 'crcw-booked', role: 'note' }, [
      h('strong', { text: 'Booked' }),
      h('span', { text: label || 'Your consultation' }),
      h('span', { className: 'crcw-dim', text: 'A calendar invite is on its way to your email.' })
    ]);
    el.log.appendChild(card);
    scrollToEnd();
    if (!restoring) {
      state.messages.push({ kind: 'booked', role: 'bot', text: label });
      save();
    }
  }

  function feedbackButtons(row) {
    var old = el.log.querySelectorAll('.crcw-feedback');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var wrap = h('div', { className: 'crcw-feedback', role: 'group', 'aria-label': 'Was this reply helpful?' });
    function vote(value) {
      postJson('/chat/feedback', { token: state.token, value: value }).catch(function () {});
      wrap.textContent = '';
      wrap.appendChild(h('span', { className: 'crcw-dim', text: 'Thanks for the feedback.' }));
    }
    var up = h('button', { type: 'button', className: 'crcw-icon-btn', 'aria-label': 'Helpful', title: 'Helpful', onclick: function () { vote('up'); } }, [icon('up')]);
    var down = h('button', { type: 'button', className: 'crcw-icon-btn', 'aria-label': 'Not helpful', title: 'Not helpful', onclick: function () { vote('down'); } }, [icon('down')]);
    wrap.appendChild(up);
    wrap.appendChild(down);
    row.appendChild(wrap);
  }

  function errorRow(message, retryText) {
    var row = h('div', { className: 'crcw-error', role: 'alert' });
    row.appendChild(h('span', { text: message + ' ' }));
    if (retryText) {
      row.appendChild(h('button', { type: 'button', className: 'crcw-link-btn', text: 'Try again', onclick: function () { row.remove(); send(retryText, true); } }));
      row.appendChild(document.createTextNode(' · '));
    }
    if (!state.handoffDone) {
      row.appendChild(h('button', { type: 'button', className: 'crcw-link-btn', text: 'Leave your details', onclick: function () { row.remove(); showHandoff(); } }));
    }
    if (opts.fallbackEmail) {
      row.appendChild(document.createTextNode(' · '));
      row.appendChild(h('a', { href: 'mailto:' + opts.fallbackEmail, text: 'Email us' }));
    }
    el.log.appendChild(row);
    scrollToEnd();
  }

  function typing(statusText) {
    var row = h('div', { className: 'crcw-msg crcw-bot crcw-typing-row', 'aria-hidden': 'true' }, [
      h('div', { className: 'crcw-bubble crcw-typing' }, [
        h('span', { className: 'crcw-dot' }), h('span', { className: 'crcw-dot' }), h('span', { className: 'crcw-dot' }),
        h('span', { className: 'crcw-status', text: statusText || '' })
      ])
    ]);
    el.log.appendChild(row);
    scrollToEnd();
    return row;
  }

  /* ---------------- sending ---------------- */

  function setBusy(busy) {
    state.busy = busy;
    el.send.disabled = busy;
    el.input.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function send(text, isRetry) {
    text = String(text || '').trim();
    if (!text || state.busy) return;
    var max = (cfg && cfg.maxMessageChars) || 1000;
    if (text.length > max) {
      errorRow('Please keep messages under ' + max + ' characters.', null);
      return;
    }
    clearChips();
    var oldFeedback = el.log.querySelectorAll('.crcw-feedback');
    for (var i = 0; i < oldFeedback.length; i++) oldFeedback[i].remove();
    if (!isRetry) {
      bubble('user', text);
      state.messages.push({ role: 'user', text: text });
      save();
    }
    el.input.value = '';
    autosize();
    setBusy(true);
    announce('Message sent. The assistant is replying.');

    var waiting = typing('');
    var reply = null; // { row, body }
    var replyText = '';
    var meta = null;
    var slots = null;
    var booked = null;
    var failed = null;

    function onEvent(event, data) {
      if (event === 'delta') {
        if (!reply) {
          waiting.remove();
          reply = bubble('bot', '');
          reply.row.setAttribute('aria-hidden', 'true'); // read once, complete, at the end
        }
        replyText += data.text;
        setText(reply.body, replyText);
        scrollToEnd();
      } else if (event === 'status') {
        var s = waiting.querySelector('.crcw-status');
        if (s) s.textContent = data.text;
        if (reply) { // a tool runs after some text: show progress below it
          waiting.remove();
          waiting = typing(data.text);
        }
        announce(data.text);
      } else if (event === 'slots') {
        slots = data.slots;
      } else if (event === 'booked') {
        booked = data.label || '';
      } else if (event === 'meta') {
        meta = data;
      } else if (event === 'error') {
        failed = data.message;
      }
    }

    function run(attempt) {
      return ensureSession().then(function () {
        return streamReply(text, onEvent);
      }).catch(function (err) {
        if (err && err.status === 401 && attempt === 0) { // session expired: start a fresh one once
          state.token = null;
          return run(1);
        }
        throw err;
      });
    }

    run(0).then(function () {
      if (waiting.parentNode) waiting.remove();
      if (reply) {
        reply.row.removeAttribute('aria-hidden');
        state.messages.push({ role: 'bot', text: replyText });
        save();
        announce('Assistant: ' + replyText);
        feedbackButtons(reply.row);
      }
      if (failed) {
        errorRow(failed, text);
        return;
      }
      if (booked !== null) bookedCard(booked);
      if (slots && booked === null) slotButtons(slots);
      if (meta && meta.action === 'end_conversation') {
        chips([], false);
      } else {
        chips(meta ? meta.suggestions : [], !!(meta && meta.action === 'offer_handoff'));
      }
    }).catch(function (err) {
      if (waiting.parentNode) waiting.remove();
      var msg = (err && err.userMessage) || 'Sorry, the assistant is not reachable right now.';
      if (err && err.status === 429) errorRow(msg, null);
      else errorRow(msg, text);
      announce(msg);
    }).then(function () {
      setBusy(false);
      if (state.open) el.input.focus();
    });
  }

  /* ---------------- hand-off form ---------------- */

  function showHandoff() {
    if (el.log.querySelector('.crcw-handoff')) { el.log.querySelector('.crcw-handoff input').focus(); return; }
    clearChips();
    var who = cfg.handoffName || 'the team';
    var id = 'crcw-h-' + Date.now();
    var status = h('p', { className: 'crcw-dim', role: 'status' });
    var form = h('form', { className: 'crcw-handoff', 'aria-labelledby': id + '-t', novalidate: true }, [
      h('p', { id: id + '-t', className: 'crcw-handoff-title', text: 'Leave your details and ' + who + ' will get back to you by email. This conversation is included.' }),
      h('label', { for: id + '-n', text: 'Name' }),
      h('input', { id: id + '-n', name: 'name', type: 'text', autocomplete: 'name', required: true, maxlength: '120' }),
      h('label', { for: id + '-e', text: 'Email' }),
      h('input', { id: id + '-e', name: 'email', type: 'email', autocomplete: 'email', required: true, maxlength: '254', value: state.email || '' }),
      h('label', { for: id + '-m', text: 'Anything to add? (optional)' }),
      h('textarea', { id: id + '-m', name: 'note', rows: '2', maxlength: '1000' }),
      h('div', { className: 'crcw-hp', 'aria-hidden': 'true' }, [
        h('label', { for: id + '-w', text: 'Leave empty' }),
        h('input', { id: id + '-w', name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off' })
      ]),
      h('div', { className: 'crcw-handoff-actions' }, [
        h('button', { type: 'submit', className: 'crcw-primary', text: 'Send to ' + who }),
        h('button', { type: 'button', className: 'crcw-link-btn', text: 'Cancel', onclick: function () { form.remove(); el.input.focus(); } })
      ]),
      status
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = 'Please add your name and a valid email address.';
        (name ? form.elements.email : form.elements.name).focus();
        return;
      }
      var button = form.querySelector('.crcw-primary');
      button.disabled = true;
      status.textContent = 'Sending…';
      ensureSession().then(function () {
        return postJson('/chat/handoff', {
          token: state.token, name: name, email: email,
          note: form.elements.note.value, website: form.elements.website.value
        });
      }).then(function (data) {
        if (!data.ok) throw new Error(data.message || 'failed');
        state.email = email.toLowerCase();
        state.handoffDone = true;
        form.remove();
        bubble('bot', data.message);
        state.messages.push({ role: 'bot', text: data.message });
        save();
        announce(data.message);
        el.input.focus();
      }).catch(function (err) {
        button.disabled = false;
        status.textContent = (err && err.message && err.message !== 'failed' ? err.message : 'That did not go through.') +
          (opts.fallbackEmail ? ' You can also email ' + opts.fallbackEmail + '.' : '');
      });
    });
    el.log.appendChild(form);
    scrollToEnd();
    form.elements.name.focus();
  }

  /* ---------------- panel ---------------- */

  function autosize() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(el.input.scrollHeight, 120) + 'px';
  }

  function openPanel(focusInput) {
    state.open = true;
    save();
    el.root.classList.add('crcw-is-open');
    el.launcher.setAttribute('aria-expanded', 'true');
    el.panel.hidden = false;
    if (!el.log.childNodes.length) renderStored();
    if (focusInput !== false) el.input.focus();
    scrollToEnd();
    // Open the server session now (and run Turnstile) so the first reply is quick.
    ensureSession().catch(function () { /* shown when they send */ });
  }

  function closePanel() {
    state.open = false;
    save();
    el.root.classList.remove('crcw-is-open');
    el.launcher.setAttribute('aria-expanded', 'false');
    el.panel.hidden = true;
    el.launcher.focus();
  }

  function newChat() {
    clearConversation();
    el.log.textContent = '';
    renderStored();
    el.input.focus();
    announce('Started a new conversation.');
  }

  function build() {
    var title = cfg.businessName + ' assistant';
    el.live = h('div', { className: 'crcw-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
    el.log = h('div', { className: 'crcw-log', id: 'crcw-log', tabindex: '0', 'aria-label': 'Conversation' });
    el.input = h('textarea', {
      id: 'crcw-input', className: 'crcw-input', rows: '1', maxlength: String(cfg.maxMessageChars || 1000),
      placeholder: 'Type your message…', 'aria-label': 'Message', autocomplete: 'off'
    });
    el.send = h('button', { type: 'submit', className: 'crcw-send', 'aria-label': 'Send message' }, [icon('send')]);
    el.verify = h('div', { className: 'crcw-verify' });

    var form = h('form', { className: 'crcw-composer', onsubmit: function (e) { e.preventDefault(); send(el.input.value); } }, [el.input, el.send]);
    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send(el.input.value);
      }
    });
    el.input.addEventListener('input', autosize);

    var privacy = cfg.privacyUrl || opts.privacyUrl;
    var footer = h('p', { className: 'crcw-foot' }, [
      'AI assistant. It can make mistakes. ',
      privacy ? h('a', { href: privacy, text: 'Privacy' }) : null,
      privacy ? ' · ' : null,
      h('button', { type: 'button', className: 'crcw-link-btn', text: 'New chat', onclick: newChat })
    ]);

    el.panel = h('div', {
      id: 'crcw-panel', className: 'crcw-panel', role: 'dialog', 'aria-modal': 'false',
      'aria-labelledby': 'crcw-title', 'aria-describedby': 'crcw-sub', hidden: true
    }, [
      h('div', { className: 'crcw-head' }, [
        h('div', { className: 'crcw-head-text' }, [
          h('h2', { id: 'crcw-title', className: 'crcw-title' }, [title, h('span', { className: 'crcw-badge', text: 'AI' })]),
          h('p', { id: 'crcw-sub', className: 'crcw-sub', text: 'Automated assistant · replies in seconds' })
        ]),
        h('button', {
          type: 'button', className: 'crcw-head-btn',
          text: 'Talk to ' + (cfg.handoffName || 'a person'),
          onclick: showHandoff
        }),
        h('button', { type: 'button', className: 'crcw-icon-btn crcw-close', 'aria-label': 'Close chat', onclick: closePanel }, [icon('close')])
      ]),
      el.log,
      el.verify,
      form,
      footer,
      el.live
    ]);
    el.panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closePanel(); }
    });

    el.launcher = h('button', {
      type: 'button', className: 'crcw-launcher', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      'aria-controls': 'crcw-panel', 'aria-label': 'Chat with our AI assistant',
      onclick: function () { if (state.open) closePanel(); else openPanel(); }
    }, [icon('chat'), h('span', { className: 'crcw-launcher-label', text: 'Ask us anything' })]);

    el.root = h('div', { className: 'crcw-root', id: 'crcw-root' }, [el.panel, el.launcher]);
    document.body.appendChild(el.root);
  }

  /* ---------------- start ---------------- */

  function start(options) {
    Object.keys(options || {}).forEach(function (k) { opts[k] = options[k]; });
    if (!opts.api || !window.fetch || !window.TextDecoder || !window.ReadableStream) return Promise.resolve(false);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = window.setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
    // Health gate: no launcher at all unless the service answers with chat enabled.
    return fetch(api('/chat/config'), { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        window.clearTimeout(timer);
        if (!data || data.ok !== true || data.enabled !== true) return false;
        cfg = data;
        load();
        build();
        if (state.open) openPanel(false);
        return true;
      })
      .catch(function () { window.clearTimeout(timer); return false; });
  }

  window.CrcChat = {
    start: start,
    open: function () { if (el.panel && !state.open) openPanel(); }
  };
})();
