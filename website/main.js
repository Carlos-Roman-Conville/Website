// Mobile nav toggle
document.getElementById('nav-toggle').addEventListener('click', function() {
  document.getElementById('nav-links').classList.toggle('open');
  this.classList.toggle('active');
});

document.querySelectorAll('.nav-links a').forEach(function(link) {
  link.addEventListener('click', function(e) {
    document.getElementById('nav-links').classList.remove('open');
    document.getElementById('nav-toggle').classList.remove('active');
    var href = this.getAttribute('href');
    if (href && href.startsWith('#') && href.length > 1) {
      e.preventDefault();
      var target = document.getElementById(href.substring(1));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      history.pushState(null, '', href);
    }
  });
});

// Scroll fade-in
var autoFadeEls = document.querySelectorAll('.service-outcome-card, .project-card, .about-text, .about-card, .section-tag, .section-title, .pillar-header, .section-intro, .faq-item');
autoFadeEls.forEach(function(el) { el.classList.add('fade-up'); });

var observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.fade-up').forEach(function(el) { observer.observe(el); });

var RECEPTIONIST_API = (window.CRC_RECEPTIONIST_API || 'https://chat.crc-solutions.org').replace(/\/$/, '');

// Chat widget. It is health-gated itself (GO-LIVE GL-1): no launcher unless the chat service
// answers /chat/config with chat enabled, so a backend outage never leaves a dead chat on the page.
if (window.CrcChat) {
  CrcChat.start({
    api: RECEPTIONIST_API,
    privacyUrl: 'privacy.html',
    fallbackEmail: 'carlos@crc-solutions.org'
  });
}

// Build a mailto: link holding the visitor's message, so a failed form send is never lost.
function contactMailto(name, message) {
  return 'mailto:carlos@crc-solutions.org?subject=' + encodeURIComponent('Website inquiry from ' + name) +
    '&body=' + encodeURIComponent(message);
}

// Contact form async submission
(function() {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var btn = document.getElementById('cf-submit');
  var status = document.getElementById('cf-status');

  // Bot check (GL-18): the same Turnstile site key the chat uses, from the chat service's /chat/config.
  var verifyBox = document.getElementById('cf-verify');
  var siteKeyReady = null;
  var widgetId = null;
  function contactSiteKey() {
    if (!siteKeyReady) {
      siteKeyReady = fetch(RECEPTIONIST_API + '/chat/config')
        .then(function(res) { return res.ok ? res.json() : {}; })
        .then(function(cfg) { return (cfg && cfg.turnstileSiteKey) || null; })
        .catch(function() { siteKeyReady = null; return null; });
    }
    return siteKeyReady;
  }
  function loadTurnstile() {
    return new Promise(function(resolve, reject) {
      if (window.turnstile) return resolve(window.turnstile);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function() { resolve(window.turnstile); };
      s.onerror = function() { reject(new Error('turnstile_load_failed')); };
      document.head.appendChild(s);
    });
  }
  // A Turnstile token works once, so every send renders a fresh widget. No site key = no token;
  // the server then decides (production refuses, and the catch below offers email instead).
  function contactToken() {
    return contactSiteKey().then(function(siteKey) {
      if (!siteKey) return null;
      return loadTurnstile().then(function(ts) {
        return new Promise(function(resolve, reject) {
          if (widgetId !== null) ts.remove(widgetId);
          widgetId = ts.render(verifyBox, {
            sitekey: siteKey,
            appearance: 'interaction-only',
            action: 'contact_form',
            callback: resolve,
            'error-callback': function() { reject(new Error('turnstile_failed')); }
          });
        });
      });
    });
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (form.querySelector('[name="website"]').value) return;

    var name = form.querySelector('[name="name"]').value.trim();
    var email = form.querySelector('[name="email"]').value.trim();
    var message = form.querySelector('[name="message"]').value.trim();

    if (!name || !email || !message) {
      status.textContent = 'Please fill in all fields.';
      status.className = 'form-status form-status-error';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.textContent = 'Please enter a valid email address.';
      status.className = 'form-status form-status-error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';
    status.textContent = '';
    status.className = 'form-status';

    contactToken().then(function(token) {
      return fetch(RECEPTIONIST_API + '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          message: message,
          turnstileToken: token,
          timestamp: new Date().toISOString()
        })
      });
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Server error');
      return res.json();
    })
    .then(function() {
      status.textContent = 'Message received. I’ll follow up at the email you provided.';
      status.className = 'form-status form-status-success';
      form.reset();
    })
    .catch(function() {
      // The backend is unreachable: keep the visitor's words and hand them to their email app.
      status.textContent = 'Our form is offline right now. ';
      var link = document.createElement('a');
      link.href = contactMailto(name, message);
      link.textContent = 'Send this message by email instead';
      status.appendChild(link);
      status.appendChild(document.createTextNode(' (it opens your email app with your message filled in).'));
      status.className = 'form-status form-status-error';
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = 'Send Message';
    });
  });
})();
