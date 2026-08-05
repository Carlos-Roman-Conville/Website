# CRC Solutions — Website

Marketing site for [crc-solutions.org](https://crc-solutions.org) with an embedded AI assistant that qualifies visitors, answers service questions, and routes strong leads to booking.

The site isn't a brochure. The assistant is the lead-generation system, and it runs in production.

## What's here

| Directory | Contents |
|---|---|
| `website/` | The site itself — pages, styles, assets |
| `chat-widget/` | Embedded AI assistant, front end and API glue |
| `n8n-workflow/` | Automation workflows behind intake, routing, and notifications |

## The assistant

A visitor asks a question. The assistant answers from the service catalog, asks qualifying questions back, scores intent, and — when a lead is strong — captures contact details and routes to calendar booking with a notification out.

Controls that matter once it's live:

- **Rate limiting** so one visitor can't run up API cost
- **Spending caps** as a hard ceiling
- **Email gating** before the conversation goes deep
- **Human approval** before anything reaches the calendar

## Stack

JavaScript · Claude API · n8n · Airtable · Gmail · Google Calendar

## Notes

Built and maintained by CRC Solutions. The intake pattern deployed here is the same one installed for clients — the site is the working demo.
