// Mobile nav toggle
document.getElementById('nav-toggle').addEventListener('click', function() {
  document.getElementById('nav-links').classList.toggle('open');
  this.classList.toggle('active');
});

document.querySelectorAll('.nav-links a').forEach(function(link) {
  link.addEventListener('click', function() {
    document.getElementById('nav-links').classList.remove('open');
    document.getElementById('nav-toggle').classList.remove('active');
  });
});

// Scroll fade-in
var fadeEls = document.querySelectorAll('.service-outcome-card, .project-card, .about-text, .about-card, .section-tag, .section-title, .pillar-header, .section-intro, .process-step, .faq-item');
fadeEls.forEach(function(el) { el.classList.add('fade-up'); });

var observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

fadeEls.forEach(function(el) { observer.observe(el); });

// Init chat widget
CarlosChat.init({
  webhookUrl: 'https://chat.crc-solutions.org/webhook/chat',
  brandColor: '#a3e635',
  brandColorHover: '#bef264'
});

// Contact form async submission
(function() {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var btn = document.getElementById('cf-submit');
  var status = document.getElementById('cf-status');

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

    fetch('https://chat.crc-solutions.org/webhook/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        email: email,
        message: message,
        timestamp: new Date().toISOString()
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Server error');
      status.textContent = 'Message received. I’ll follow up at the email you provided.';
      status.className = 'form-status form-status-success';
      form.reset();
    })
    .catch(function() {
      status.textContent = 'Could not send your message. Please try again or email carlos@crc-solutions.org directly.';
      status.className = 'form-status form-status-error';
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = 'Send Message';
    });
  });
})();
