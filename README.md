# CRC Solutions Website

Marketing site for [crc-solutions.org](https://crc-solutions.org) with an embedded AI assistant powered by the **Receptionist** backend (shared brain with phone).

## What's here

| Directory | Contents |
|---|---|
| `website/` | Static site: pages, styles, chat widget, `site-config.js` |
| `chat-widget/` | Copy of widget for local test page |
| `n8n-workflow/` | **Legacy reference only** — do not use in production |

## Backend wiring (Phase 5)

`website/site-config.js` sets the API base:

```javascript
window.CRC_RECEPTIONIST_API = 'https://chat.crc-solutions.org';
```

| Frontend | Endpoint |
|----------|----------|
| Chat widget | `POST /chat` |
| Contact form | `POST /contact` |

Deploy the Receptionist stack first (`E:\AI Programs\Receptionist\deploy\README.md`), then publish this static site.

## Local widget test

Point `site-config.js` at `http://localhost:3000` and run `npm run chat:dev` in the Receptionist repo.

## Stack

Static HTML/CSS/JS · Receptionist chat service · Claude · Postgres · Pushover · SMTP briefing
