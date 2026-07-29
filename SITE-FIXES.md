# CRC Solutions - Site Architecture Fixes

## Priority Fixes

- [ ] **1. og:image + Twitter card meta tags**
  Social shares (LinkedIn, Slack, Twitter, iMessage) show no preview image.
  Needs: og:image, twitter:card, twitter:title, twitter:description, twitter:image

- [x] **2. Chat persistence (localStorage)**
  Save/restore email, sessionId, messages via localStorage with 24hr expiry.

- [x] **3. JSON-LD structured data**
  Added ProfessionalService schema + Twitter card meta tags.

- [x] **4. `<main>` landmark + skip-to-content link**
  Added skip link (visible on Tab focus) and wrapped content in `<main>`.

- [x] **5. Heading hierarchy (h4 to h3)**
  Changed all h4 to h3 in About card and FAQ items. Updated CSS selectors.

- [x] **6. 404 page**
  Added 404.html matching site design for Cloudflare Pages.

- [x] **7. Alt text on 3 badge images**
  Added alt text to portfolio, about, and contact badge images.

- [x] **8. Chat rate limiting**
  Added 2-second cooldown between message sends.

## Future / Waiting on User

- [ ] Social media links (Twitter, LinkedIn) - waiting on user to provide
- [ ] og:image asset - need preview image for social shares
- [ ] Featured project hierarchy (make AI assistant the flagship)
- [ ] Project screenshots / visual evidence
- [ ] Icon normalization (problem section icons)
