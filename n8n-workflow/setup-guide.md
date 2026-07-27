# Portfolio AI Assistant - Setup Guide

## Prerequisites

1. **Node.js** (v18+) - https://nodejs.org
2. **Anthropic API key** - https://console.anthropic.com

## Quick Start

1. Edit `.env` and paste your Anthropic API key
2. Double-click `start-n8n.bat`
3. That's it. The script handles n8n installation, workflow import, and startup.

## What It Does

- Webhook at `http://localhost:5678/webhook/chat` accepts POST requests
- Validates email (rejects if missing)
- Rate limits at 20 messages per session
- Sends messages to Claude with full conversation history (last 10 turns)
- Scores leads as hot/warm/cold
- Routes hot/warm leads for notification
- Returns JSON response to the chat widget

## API

**POST** `/webhook/chat`

```json
{
  "message": "Hi, I need a web scraper built",
  "sessionId": "unique-session-id",
  "email": "visitor@example.com",
  "messageCount": 1,
  "timestamp": "2026-07-25T12:00:00Z"
}
```

**Response:**

```json
{
  "reply": "Hey! That sounds great...",
  "leadScore": "warm",
  "action": "none"
}
```

## File Structure

```
portfolio-assistant/
  .env                          # API key (edit this)
  start-n8n.bat                 # Run this to start everything
  n8n-workflow/
    workflow-v2.json            # The n8n workflow definition
    claude-system-prompt.txt    # System prompt (reference copy)
    setup-guide.md              # This file
  portfolio-ai-assistant-project-doc.md
```

## Architecture

```
Chat Webhook (POST /webhook/chat)
  -> Extract Input
    -> Email Provided?
      YES -> Rate Limit Check
        UNDER 20 -> Load History (reads past conversation)
          -> Claude API (Haiku 4.5)
            -> Parse Response
              -> Save Turn (writes to memory)
                -> Route by Score
                  Hot Lead -> Save Lead + Notify Carlos -> Respond
                  Warm Lead -> Save Lead + Notify Carlos -> Respond
                  Booking -> Save Lead + Booking Flow -> Respond
                  Cold/General -> Respond
        OVER 20 -> Reject (rate limited)
      NO -> Reject (email required)
```

## Notes

- Conversation memory uses n8n's internal static data (stored in n8n's SQLite database at ~/.n8n/)
- Sessions auto-prune after 24 hours
- Each session keeps the last 20 turns
- The model is `claude-haiku-4-5-20251001` (fast, cheap, good enough for chat)
- n8n editor is at `http://localhost:5678` (creates login on first run)
- Set a spend cap at console.anthropic.com as a safety net
