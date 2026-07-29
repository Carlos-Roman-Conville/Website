# CRC Solutions - Site Architecture Fixes

## Priority Fixes

- [ ] **1. og:image + Twitter card meta tags**
  Social shares (LinkedIn, Slack, Twitter, iMessage) show no preview image.
  Needs: og:image, twitter:card, twitter:title, twitter:description, twitter:image

- [ ] **2. Chat persistence (localStorage)**
  Visitors lose entire conversation on page refresh. Email, messages, session all gone.
  Fix: Save state to localStorage, restore on page load.

- [ ] **3. JSON-LD structured data**
  No rich snippets in Google search results. Missing business type, services, contact info.
  Add: LocalBusiness or ProfessionalService schema.

- [ ] **4. `<main>` landmark + skip-to-content link**
  Screen readers can't identify primary content. Keyboard users must tab through entire nav.
  Fix: Wrap content in `<main>`, add skip link before nav.

- [ ] **5. Heading hierarchy (h4 to h3)**
  About card and FAQ questions skip from h2 to h4. Hurts SEO and screen reader nav.
  Fix: Change h4 tags to h3 in About card and FAQ items.

- [ ] **6. 404 page**
  Bad URLs silently redirect to homepage. Visitor has no idea the page doesn't exist.
  Fix: Add 404.html for Cloudflare Pages.

- [ ] **7. Alt text on 3 badge images**
  icon-portfolio.png, icon-eye.png, icon-gear.png have empty alt attributes.
  Fix: Add descriptive alt text.

- [ ] **8. Chat rate limiting**
  No client-side throttle on message sending. Webhook can be spammed.
  Fix: Add cooldown timer between messages.

## Future / Waiting on User

- [ ] Social media links (Twitter, LinkedIn) - waiting on user to provide
- [ ] og:image asset - need preview image for social shares
- [ ] Featured project hierarchy (make AI assistant the flagship)
- [ ] Project screenshots / visual evidence
- [ ] Icon normalization (problem section icons)
