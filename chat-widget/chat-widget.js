(function() {
  'use strict';

  const CONFIG = {
    webhookUrl: '/webhook/chat',
    position: 'bottom-right',
    brandColor: '#2563eb',
    brandColorHover: '#1d4ed8',
    assistantName: "Carlos's Assistant",
    greeting: "Hey! I'm Carlos's assistant. What brings you here today?",
    emailPrompt: "Before we chat, what's your email so Carlos can follow up if needed?",
    placeholder: 'Type a message...',
    emailPlaceholder: 'your@email.com'
  };

  let state = {
    open: false,
    email: null,
    sessionId: null,
    messageCount: 0,
    messages: [],
    sending: false
  };

  function generateSessionId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function injectStyles() {
    const css = `
      #cw-container * { box-sizing: border-box; margin: 0; padding: 0; }
      #cw-container {
        --cw-brand: ${CONFIG.brandColor};
        --cw-brand-hover: ${CONFIG.brandColorHover};
        --cw-radius: 12px;
        --cw-shadow: 0 8px 32px rgba(0,0,0,0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        font-size: 15px;
        line-height: 1.5;
      }

      /* Bubble */
      #cw-bubble {
        width: 60px; height: 60px;
        border-radius: 50%;
        background: var(--cw-brand);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: var(--cw-shadow);
        transition: transform 0.2s, background 0.2s;
        border: none;
        outline: none;
      }
      #cw-bubble:hover { transform: scale(1.08); background: var(--cw-brand-hover); }
      #cw-bubble svg { width: 28px; height: 28px; fill: #fff; }
      #cw-bubble.cw-hidden { display: none; }

      /* Panel */
      #cw-panel {
        display: none;
        flex-direction: column;
        width: 380px;
        max-width: calc(100vw - 48px);
        height: 520px;
        max-height: calc(100vh - 100px);
        background: #fff;
        border-radius: var(--cw-radius);
        box-shadow: var(--cw-shadow);
        overflow: hidden;
        position: absolute;
        bottom: 72px;
        right: 0;
      }
      #cw-panel.cw-open { display: flex; }

      /* Header */
      #cw-header {
        background: var(--cw-brand);
        color: #fff;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      #cw-header-title {
        font-weight: 600;
        font-size: 16px;
      }
      #cw-header-subtitle {
        font-size: 12px;
        opacity: 0.85;
        margin-top: 2px;
      }
      #cw-close {
        background: none; border: none; color: #fff;
        cursor: pointer; font-size: 22px; padding: 4px 8px;
        opacity: 0.8; transition: opacity 0.2s;
        line-height: 1;
      }
      #cw-close:hover { opacity: 1; }

      /* Messages */
      #cw-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f8f9fb;
      }
      .cw-msg {
        max-width: 82%;
        padding: 10px 14px;
        border-radius: 16px;
        word-wrap: break-word;
        animation: cw-fade-in 0.2s ease;
      }
      @keyframes cw-fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .cw-msg-bot {
        background: #fff;
        color: #1a1a1a;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
      .cw-msg-user {
        background: var(--cw-brand);
        color: #fff;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }

      /* Typing indicator */
      .cw-typing {
        display: flex; gap: 4px; padding: 12px 16px;
        align-self: flex-start;
        background: #fff;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
      .cw-typing-dot {
        width: 7px; height: 7px;
        background: #aaa;
        border-radius: 50%;
        animation: cw-bounce 1.2s infinite;
      }
      .cw-typing-dot:nth-child(2) { animation-delay: 0.15s; }
      .cw-typing-dot:nth-child(3) { animation-delay: 0.3s; }
      @keyframes cw-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }

      /* Input area */
      #cw-input-area {
        display: flex;
        padding: 12px;
        border-top: 1px solid #e5e7eb;
        background: #fff;
        gap: 8px;
        flex-shrink: 0;
      }
      #cw-input {
        flex: 1;
        border: 1px solid #d1d5db;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        font-family: inherit;
        transition: border-color 0.2s;
        resize: none;
        min-height: 40px;
        max-height: 100px;
      }
      #cw-input:focus { border-color: var(--cw-brand); }
      #cw-send {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: var(--cw-brand);
        border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s, opacity 0.2s;
        flex-shrink: 0;
      }
      #cw-send:hover { background: var(--cw-brand-hover); }
      #cw-send:disabled { opacity: 0.5; cursor: not-allowed; }
      #cw-send svg { width: 18px; height: 18px; fill: #fff; }

      /* Email gate */
      #cw-email-gate {
        padding: 20px;
        background: #fff;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 12px;
      }
      #cw-email-gate p {
        color: #374151;
        text-align: center;
        font-size: 15px;
      }
      #cw-email-input {
        border: 1px solid #d1d5db;
        border-radius: 8px;
        padding: 12px 16px;
        font-size: 15px;
        outline: none;
        font-family: inherit;
        width: 100%;
        transition: border-color 0.2s;
      }
      #cw-email-input:focus { border-color: var(--cw-brand); }
      #cw-email-submit {
        background: var(--cw-brand);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
        font-family: inherit;
      }
      #cw-email-submit:hover { background: var(--cw-brand-hover); }
      .cw-email-error {
        color: #dc2626;
        font-size: 13px;
        text-align: center;
      }

      /* Powered by */
      #cw-powered {
        text-align: center;
        padding: 6px;
        font-size: 11px;
        color: #9ca3af;
        background: #fff;
        border-top: 1px solid #f3f4f6;
      }

      /* Mobile responsive */
      @media (max-width: 480px) {
        #cw-panel {
          width: calc(100vw - 16px);
          height: calc(100vh - 80px);
          max-height: calc(100vh - 80px);
          bottom: 68px;
          right: -16px;
          border-radius: 16px 16px 0 0;
        }
        #cw-container { bottom: 12px; right: 20px; }
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createWidget() {
    const container = document.createElement('div');
    container.id = 'cw-container';
    container.innerHTML = `
      <div id="cw-panel">
        <div id="cw-header">
          <div>
            <div id="cw-header-title">${CONFIG.assistantName}</div>
            <div id="cw-header-subtitle">Usually replies instantly</div>
          </div>
          <button id="cw-close">&times;</button>
        </div>
        <div id="cw-email-gate">
          <p>${CONFIG.emailPrompt}</p>
          <input type="email" id="cw-email-input" placeholder="${CONFIG.emailPlaceholder}" />
          <button id="cw-email-submit">Start chatting</button>
        </div>
        <div id="cw-messages" style="display:none;"></div>
        <div id="cw-input-area" style="display:none;">
          <input type="text" id="cw-input" placeholder="${CONFIG.placeholder}" />
          <button id="cw-send">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div id="cw-powered">Powered by Carlos's AI</div>
      </div>
      <button id="cw-bubble">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      </button>
    `;
    document.body.appendChild(container);
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('cw-bubble').addEventListener('click', togglePanel);
    document.getElementById('cw-close').addEventListener('click', togglePanel);
    document.getElementById('cw-email-submit').addEventListener('click', submitEmail);
    document.getElementById('cw-email-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submitEmail();
    });
    document.getElementById('cw-send').addEventListener('click', sendMessage);
    document.getElementById('cw-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function togglePanel() {
    state.open = !state.open;
    document.getElementById('cw-panel').classList.toggle('cw-open', state.open);
    document.getElementById('cw-bubble').classList.toggle('cw-hidden', state.open);
    if (state.open && state.email) {
      document.getElementById('cw-input').focus();
    } else if (state.open) {
      document.getElementById('cw-email-input').focus();
    }
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function submitEmail() {
    const input = document.getElementById('cw-email-input');
    const email = input.value.trim();
    const existing = document.querySelector('.cw-email-error');
    if (existing) existing.remove();

    if (!validateEmail(email)) {
      const err = document.createElement('p');
      err.className = 'cw-email-error';
      err.textContent = 'Please enter a valid email address.';
      document.getElementById('cw-email-gate').appendChild(err);
      return;
    }

    state.email = email;
    state.sessionId = generateSessionId();

    document.getElementById('cw-email-gate').style.display = 'none';
    document.getElementById('cw-messages').style.display = 'flex';
    document.getElementById('cw-input-area').style.display = 'flex';

    addMessage(CONFIG.greeting, 'bot');
    document.getElementById('cw-input').focus();
  }

  function addMessage(text, sender) {
    const container = document.getElementById('cw-messages');
    const msg = document.createElement('div');
    msg.className = 'cw-msg cw-msg-' + sender;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
  }

  function showTyping() {
    const container = document.getElementById('cw-messages');
    const typing = document.createElement('div');
    typing.className = 'cw-typing';
    typing.id = 'cw-typing';
    typing.innerHTML = '<div class="cw-typing-dot"></div><div class="cw-typing-dot"></div><div class="cw-typing-dot"></div>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('cw-typing');
    if (el) el.remove();
  }

  async function sendMessage() {
    if (state.sending) return;
    const input = document.getElementById('cw-input');
    const text = input.value.trim();
    if (!text) return;

    state.sending = true;
    state.messageCount++;
    input.value = '';
    document.getElementById('cw-send').disabled = true;

    addMessage(text, 'user');
    showTyping();

    try {
      const res = await fetch(CONFIG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: state.sessionId,
          email: state.email,
          messageCount: state.messageCount,
          timestamp: new Date().toISOString()
        })
      });

      hideTyping();

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (errData && errData.reply) {
          addMessage(errData.reply, 'bot');
        } else {
          addMessage("Sorry, something went wrong. Try again in a moment.", 'bot');
        }
      } else {
        const data = await res.json();
        addMessage(data.reply, 'bot');

        if (data.action === 'end_conversation') {
          document.getElementById('cw-input').disabled = true;
          document.getElementById('cw-send').disabled = true;
          return;
        }
      }
    } catch (err) {
      hideTyping();
      addMessage("Can't reach the server right now. Please try again later.", 'bot');
    }

    state.sending = false;
    document.getElementById('cw-send').disabled = false;
    document.getElementById('cw-input').focus();
  }

  // Public API for configuration
  window.CarlosChat = {
    init: function(options) {
      if (options) {
        if (options.webhookUrl) CONFIG.webhookUrl = options.webhookUrl;
        if (options.brandColor) {
          CONFIG.brandColor = options.brandColor;
          CONFIG.brandColorHover = options.brandColorHover || options.brandColor;
        }
        if (options.greeting) CONFIG.greeting = options.greeting;
        if (options.assistantName) CONFIG.assistantName = options.assistantName;
      }
      injectStyles();
      createWidget();
    },
    open: function() {
      if (!state.open) togglePanel();
    }
  };

  // Auto-init if no manual init needed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (!window._cwManualInit) {
        window.CarlosChat.init();
      }
    });
  } else {
    if (!window._cwManualInit) {
      window.CarlosChat.init();
    }
  }
})();
