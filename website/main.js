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
  webhookUrl: 'http://localhost:5678/webhook/chat',
  brandColor: '#a3e635',
  brandColorHover: '#bef264'
});
