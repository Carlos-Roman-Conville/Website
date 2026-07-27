# Project: Portfolio Website with AI Assistant & Lead Qualification

## Project Intent

Build a personal portfolio website for Carlos Roman-Conville that showcases completed, in-progress, and experimental projects — and features a live AI chatbot that acts as a virtual assistant. The chatbot qualifies visitors, takes service requests, conducts intake interviews, and when a lead is qualified, sends Carlos an email for approval before scheduling anything to Google Calendar.

This project doubles as a portfolio piece demonstrating n8n workflow automation with Claude API, calendar, and CRM integration.

**Owner:** Carlos Roman-Conville
**Email:** rexochangobiz@gmail.com
**Date:** 2026-07-25

---

## Decisions Made

- **Website tech:** HTML / CSS / vanilla JavaScript (no frameworks)
- **Booking mode:** Always notify Carlos first — no auto-booking. Every meeting requires manual approval via email before the calendar event is created.
- **Hosting:** Vercel, Netlify, or GitHub Pages (free tier)
- **CRM:** Airtable (free tier)
- **AI engine:** Claude API (Anthropic)
- **Automation:** n8n (self-hosted or cloud)
- **Spam protection:** Email gate (required before chatting) + rate limit (20 messages/session) + Anthropic spend cap

---

## What the Visitor Sees (End-to-End Flow)

1. Visitor lands on Carlos's portfolio site
2. They see project showcases and a chat widget (bottom-right corner)
3. They click the chat widget and are asked for their email before chatting
4. The chatbot greets them and asks what they need
5. Depending on intent, the bot either:
   - Answers questions about Carlos's services and experience
   - Takes a service/project request (scope, budget, timeline)
   - Conducts a qualification interview
6. If the lead is qualified, the bot collects their preferred times
6. Carlos receives an email notification with lead details and a link/button to approve
7. Once Carlos approves, the meeting is booked on Google Calendar
8. Both Carlos and the visitor receive a calendar invite with a Google Meet link

---

## Agent Assignments

Work is split across three agents that can run in parallel. Each agent's output is independent until final integration (connecting the chat widget to the n8n webhook).

---

## AGENT 1: Portfolio Website (Frontend)

### Your Job
Build the portfolio website using plain HTML, CSS, and vanilla JavaScript. This is the public-facing site visitors will see.

### What to Build

**Pages / Sections:**
- **Hero / Landing** — Name, tagline, brief intro
- **Projects Gallery** — Cards for each project, organized into three categories:
  - Completed projects
  - In-progress projects
  - Experimental / learning projects
- **About / Services** — Who Carlos is, what services he offers, skills
- **Contact** — Basic contact info + the chat widget

**Chat Widget UI:**
- A floating button (bottom-right) that opens a chat panel
- Chat panel with:
  - Message bubbles (user messages on right, bot messages on left)
  - Text input field + send button
  - Typing indicator (for when the bot is "thinking")
  - Minimize / close button
- The chat widget sends messages to a webhook URL via `fetch()` POST request
- It receives the bot's response from the webhook and displays it
- The webhook URL will be provided by Agent 2 once the n8n workflow is built — for now, use a placeholder: `const WEBHOOK_URL = "https://YOUR-N8N-INSTANCE.com/webhook/chat"`

**Chat Widget API Contract (so Agent 2 and Agent 1 stay compatible):**
```json
// REQUEST (POST to webhook)
{
  "message": "I need a web scraper built",
  "sessionId": "unique-session-id-per-visitor",
  "timestamp": "2026-07-25T14:30:00Z",
  "email": "visitor@example.com",
  "messageCount": 3
}
// "email" is REQUIRED — collected before the chat starts. Requests without it get a 400 error.
// "messageCount" tracks how many messages this session has sent. After 20, the bot cuts off.

// RESPONSE (from webhook)
{
  "reply": "Thanks for reaching out! Can you tell me more about what you need scraped?",
  "leadScore": null,
  "action": null
}

// RESPONSE when booking is offered
{
  "reply": "Sounds like a great project. I'd love to set up a call. What times work for you?",
  "leadScore": "hot",
  "action": "request_availability"
}

// ERROR RESPONSE — no email
{
  "reply": "Please provide your email address to start chatting.",
  "leadScore": null,
  "action": "collect_email",
  "error": "email_required"
}

// ERROR RESPONSE — rate limited
{
  "reply": "You've sent a lot of messages! Feel free to email Carlos directly at rexochangobiz@gmail.com.",
  "leadScore": null,
  "action": "end_conversation",
  "error": "rate_limited"
}
```

**Spam Protection (Agent 1 must implement client-side):**
- Collect email in the chat widget BEFORE sending the first message to the webhook
- Track `messageCount` per session and send it with each request
- After 20 messages, disable the chat input client-side (the server also enforces this)
- Generate a unique `sessionId` per visitor session (e.g., `crypto.randomUUID()`)

**Design Requirements:**
- Mobile responsive (works on phone, tablet, desktop)
- Clean, modern, professional look
- Dark/light theme support (or just pick one that looks good)
- No external frameworks — plain HTML/CSS/JS only
- Accessible (semantic HTML, alt tags, good contrast)

**Deliverables:**
- `index.html` — main page
- `styles.css` — all styling
- `chat.js` — chat widget logic (fetch to webhook, display messages)
- `app.js` — any other site interactivity (project filtering, etc.)
- All files in a single folder ready to deploy

**What You Do NOT Need to Build:**
- The n8n workflow (Agent 2 handles this)
- Calendar integration (Agent 3 handles this)
- Email notifications (Agent 3 handles this)
- CRM/Airtable setup (Agent 3 handles this)

---

## AGENT 2: n8n Workflow + Claude Chatbot

### Your Job
Build the n8n workflow that powers the AI chatbot and orchestrates the lead qualification flow. This is the automation backbone.

### What to Build

**n8n Workflow — Node by Node:**

```
1. Webhook Node (trigger)
   - Receives POST from the website chat widget
   - Accepts: { message, sessionId, timestamp }
   - Returns: { reply, leadScore, action }

2. Claude API Node (AI conversation)
   - Sends the visitor's message + conversation history to Claude
   - Claude's system prompt handles qualification logic
   - Maintains conversation context per sessionId

3. Router / Switch Node (based on Claude's structured output)
   - Route A: General inquiry → respond with info, log to CRM
   - Route B: Qualified lead, not ready to book → save as warm lead, notify Carlos
   - Route C: Qualified lead, wants to book → collect availability, notify Carlos for approval

4. CRM Node (Airtable — create/update record)
   - Triggered on all routes
   - Saves lead data (see Agent 3 for Airtable schema)

5. Email Notification Node (notify Carlos)
   - Triggered on Routes B and C
   - Sends lead details + conversation summary to rexochangobiz@gmail.com
   - For Route C: includes an approval link/mechanism

6. Webhook Response Node
   - Returns Claude's reply to the website chat widget
```

**Claude System Prompt — Write This:**

The system prompt should instruct Claude to:
- Act as Carlos's virtual assistant on his portfolio site
- Be professional but approachable
- Identify visitor intent: browsing, hiring, collaboration, or general question
- For potential clients, ask qualifying questions:
  - What's the project? (web scraping, automation, data, etc.)
  - What's the budget range?
  - What's the timeline?
  - Any specific requirements?
- Score leads internally:
  - **Hot:** Clear project, reasonable budget ($100+), near-term timeline
  - **Warm:** Has a project idea but vague on budget/timeline
  - **Cold:** Just browsing, no specific need
- For hot/warm leads: offer to schedule a meeting
- For cold leads: be helpful, share info, invite them to come back
- Never promise specific prices — say "Carlos will discuss pricing on the call"
- Always be honest about Carlos being a growing freelancer
- Output structured JSON alongside the conversational reply so n8n can route properly

**Structured Output Format (Claude should return this):**
```json
{
  "reply": "The conversational message to show the visitor",
  "intent": "hiring | browsing | collaboration | question",
  "leadScore": "hot | warm | cold | null",
  "action": "none | request_availability | collect_email | end_conversation",
  "leadData": {
    "name": "extracted or null",
    "email": "extracted or null",
    "project": "summary or null",
    "budget": "extracted or null",
    "timeline": "extracted or null"
  }
}
```

**Conversation History Management:**
- Store conversation history per sessionId (use n8n's built-in memory or a simple key-value approach)
- Pass the last N messages as context to Claude on each request
- Clear sessions after 30 minutes of inactivity

**Deliverables:**
- Exported n8n workflow JSON file (importable into any n8n instance)
- Claude system prompt (as a standalone text file, easy to edit)
- Documentation: how to set up the workflow, where to paste the API key, how to configure the webhook URL

**What You Do NOT Need to Build:**
- The website frontend (Agent 1 handles this)
- Google Calendar integration details (Agent 3 handles this — but leave a placeholder node in the workflow for "Create Calendar Event" that Agent 3 will configure)
- Airtable base setup (Agent 3 handles this — but include the Airtable node in the workflow with placeholder config)

---

## AGENT 3: Integrations (Calendar + Email + CRM)

### Your Job
Set up and configure all third-party integrations: Google Calendar, email notifications, and Airtable CRM. These plug into the n8n workflow that Agent 2 builds.

### What to Build

**1. Google Calendar Integration**

- Connect to Google Calendar via OAuth in n8n
- Build the approval-then-book flow:
  1. When a lead is qualified and wants to meet, Carlos gets an email
  2. The email contains lead details + an "Approve" link
  3. When Carlos clicks Approve, the n8n workflow triggers calendar event creation
  4. The workflow checks Carlos's Google Calendar for available slots
  5. Creates a calendar event with:
     - Title: "Meeting with [Lead Name] — [Project Summary]"
     - Duration: 30 minutes
     - Attendees: Carlos (rexochangobiz@gmail.com) + lead's email
     - Description: Lead score, project details, conversation summary
     - Google Meet link (auto-generated)
  6. Calendar invite sent to both parties

- **Approval mechanism options (pick the simplest):**
  - Option A: Email with a unique approval webhook link — clicking it triggers n8n to book
  - Option B: Reply-based — Carlos replies "approve" to the email and n8n processes it
  - Recommend Option A (webhook link) for simplicity

**2. Email Notifications (Gmail via n8n)**

- Use Gmail SMTP or n8n's built-in Gmail node
- Send to: rexochangobiz@gmail.com

- **Email templates to create:**

  **a. New Qualified Lead Alert:**
  ```
  Subject: New Lead: [Name] — Score: [hot/warm]
  Body:
  - Name: [name]
  - Email: [email]
  - Project: [description]
  - Budget: [range]
  - Timeline: [timeline]
  - Lead Score: [hot/warm/cold]
  - Conversation Summary: [summary]
  - [APPROVE MEETING] button/link (if lead wants to book)
  ```

  **b. Meeting Confirmation (to Carlos):**
  ```
  Subject: Meeting Booked: [Name] on [Date] at [Time]
  Body:
  - Calendar event details
  - Google Meet link
  - Lead context recap
  ```

  **c. Meeting Confirmation (to Visitor):**
  ```
  Subject: Your meeting with Carlos is confirmed!
  Body:
  - Date and time
  - Google Meet link
  - What to prepare / what to expect
  ```

**3. CRM / Airtable Setup**

- Create an Airtable base called "Portfolio Leads"
- **Table: Leads**

  | Field              | Type            | Notes                              |
  |--------------------|-----------------|-------------------------------------|
  | Name               | Single line     |                                     |
  | Email              | Email           |                                     |
  | Company            | Single line     | Optional                            |
  | Project            | Long text       | What they need                      |
  | Budget             | Single line     | Range or specific number            |
  | Timeline           | Single line     | When they need it                   |
  | Lead Score         | Single select   | hot / warm / cold                   |
  | Status             | Single select   | new / contacted / meeting_booked / meeting_completed / closed_won / closed_lost |
  | Conversation Summary | Long text     | AI-generated summary of the chat    |
  | Source             | Single select   | portfolio_site (default)            |
  | Session ID         | Single line     | Links back to chat session          |
  | Date               | Date            | When they first chatted             |
  | Meeting Date       | Date            | When the meeting is scheduled       |
  | Notes              | Long text       | Carlos's personal notes             |

- Configure the n8n Airtable node to create/update records in this table
- Provide the Airtable API key setup instructions

**Deliverables:**
- Google Calendar OAuth setup guide (step-by-step for n8n)
- Approval webhook workflow snippet (n8n JSON for the approve-and-book flow)
- Email notification templates (HTML formatted)
- Airtable base structure (screenshot or setup guide — or Airtable template link if possible)
- Documentation: how to connect each service in n8n, where credentials go

**What You Do NOT Need to Build:**
- The website (Agent 1 handles this)
- The main n8n workflow or Claude prompt (Agent 2 handles this — you provide the integration nodes/config that plug into their workflow)

---

## Integration Points (How the Agents' Work Connects)

```
AGENT 1 (Website)                    AGENT 2 (n8n + Chatbot)              AGENT 3 (Integrations)
─────────────────                    ───────────────────────              ──────────────────────
chat.js sends POST ──────────────►  Webhook node receives it
                                    Claude processes message
                                    Router decides action
                                           │
                                           ├── save to ──────────────►  Airtable (CRM)
                                           ├── notify via ───────────►  Email to Carlos
                                           └── if approved ─────────►  Google Calendar event
                   ◄──────────────  Webhook responds with reply
chat.js displays reply
```

**Connection steps (done after all three agents finish):**
1. Take the webhook URL from Agent 2's n8n workflow
2. Paste it into Agent 1's `chat.js` as the `WEBHOOK_URL`
3. Import Agent 3's integration nodes into Agent 2's workflow
4. Add API keys / OAuth credentials to n8n
5. Test end-to-end

---

## APIs & Services Needed

| Service          | Purpose                  | Account Needed       | Agent  |
|------------------|--------------------------|----------------------|--------|
| Claude API       | AI conversation engine   | Anthropic API key    | 2      |
| n8n              | Workflow automation      | Self-hosted or cloud | 2, 3   |
| Google Calendar  | Meeting scheduling       | Google account       | 3      |
| Gmail            | Email notifications      | Google account       | 3      |
| Airtable         | Lead CRM database        | Free tier            | 3      |
| Vercel / Netlify | Website hosting          | Free tier            | 1      |

---

## Success Criteria

- [ ] Visitor can chat with the bot and get meaningful, contextual responses
- [ ] Qualified leads trigger an email notification to Carlos
- [ ] Carlos can approve a meeting via email, which books it on Google Calendar
- [ ] Both parties receive calendar invites with Google Meet links
- [ ] All leads are logged in Airtable with scores and conversation summaries
- [ ] The website is responsive and professional
- [ ] The chat widget communicates with the n8n webhook correctly
- [ ] All three agents' outputs integrate cleanly

---

## File Output Location

All deliverables should be saved to: `E:\AI Programs\Automation\AI bots\portfolio-assistant\`

```
portfolio-assistant/
├── website/              ← Agent 1 output
│   ├── index.html
│   ├── styles.css
│   ├── chat.js
│   └── app.js
├── n8n-workflow/          ← Agent 2 output
│   ├── workflow.json
│   ├── claude-system-prompt.txt
│   └── setup-guide.md
├── integrations/          ← Agent 3 output
│   ├── approval-webhook-flow.json
│   ├── email-templates/
│   ├── airtable-setup-guide.md
│   └── calendar-setup-guide.md
└── portfolio-ai-assistant-project-doc.md  ← This file
```
