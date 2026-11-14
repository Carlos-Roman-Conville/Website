# Unsubscribe endpoint (GO-LIVE GL-4)

Every CRC email carries `https://crc-solutions.org/unsubscribe?t=<token>` (footer link and `List-Unsubscribe` header,
with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`). It runs on Cloudflare, so it works while Rex's PC is off.

| Piece | What it does |
|---|---|
| `functions/unsubscribe.js` | GET: confirmation page with one button (no opt-out on GET, so mail scanners that open links don't unsubscribe anyone). POST: records the opt-out, 200. Mail providers' one-click is a POST, so it opts out with no page. Bad link: polite 400. Not configured / KV down: 503, never a false "you're unsubscribed". |
| `functions/api/opt-outs.js` | For the Inbox sync only (Bearer key). GET lists pending opt-outs; POST `{"ack": [ids]}` deletes them once the CRM has them. |
| `lib/unsub.js` | Token check, same format as Inbox `inbox/send/unsubscribe.py`; KV write. |
| KV namespace (binding `OPT_OUTS`) | One key per address, kept until the sync acknowledges it (no expiry). |

The PC side is Inbox `inbox/send/unsub_sync.py`: it runs at the start of every `python -m inbox.loop` pass (or alone:
`python -m inbox.send.unsub_sync`), records each opt-out in the CRM with `record_opt_out` (source `unsubscribe_link`),
then acknowledges it. If the PC is off for days, opt-outs wait in KV. **Run the loop (or the sync) before any send**,
so the CRM's do-not-contact check knows about them.

Why KV and not D1: one record per address, no queries beyond "list what's pending", no schema or migrations, and the
free plan covers it (a 15-minute sync is about 100 list calls a day against 1,000). KV's lists can lag a write by up to
a minute; that only means an opt-out may be offered twice, and recording one twice is harmless.

## Rex's one-time steps

Cloudflare dashboard, account that owns crc-solutions.org:

1. **Create the KV namespace.** Storage & Databases > KV > Create namespace. Name: `crc-opt-outs`.
2. **Bind it.** Workers & Pages > the crc-solutions.org Pages project > Settings > Bindings > Add > KV namespace.
   Variable name `OPT_OUTS`, namespace `crc-opt-outs`. Do it for Production (Preview too if you test previews).
3. **Set the two secrets.** On the PC, in the Inbox folder that sends the mail (`E:\shared programs\CRC Solutions\Inbox`):
   ```
   python tools/unsub_secrets.py copy unsub
   ```
   Then Pages project > Settings > Variables and Secrets > Add: type **Secret**, name `UNSUB_SECRET`, paste, save.
   ```
   python tools/unsub_secrets.py copy pull
   ```
   Add another Secret, name `OPT_OUTS_PULL_KEY`, paste, save. Then:
   ```
   python tools/unsub_secrets.py clear
   ```
   (The script never shows the values. Alternative to the dashboard: `npx wrangler login`, then
   `python tools/unsub_secrets.py wrangler <pages-project-name>`.)
4. **Deploy** the site with the `crm/unsub` branch merged. Bindings and secrets apply from the next deployment.
5. **Point the links at the site** on the PC: set `CRC_MAIL_PUBLIC_URL=https://crc-solutions.org` (or
   `public_url: "https://crc-solutions.org"` in Inbox `data/business.yaml`). The sync uses the same setting.
6. **Check it.** `https://crc-solutions.org/unsubscribe?t=x` shows "This link is not valid" (400). On the PC,
   `python -m inbox.send.unsub_sync` prints `opt-outs: 0 pulled ...` (not `unauthorized` or `not_configured`).

Keep `unsub_secret.key` as it is from now on: changing it breaks every link already sent (CAN-SPAM needs them to work
for 30 days). If it ever must change, redo step 3 for `UNSUB_SECRET` and expect old links to show "not valid"; people
can still opt out by replying.

## Tests

```
node --test tests/unsubscribe.test.mjs
```

The fixtures (`tests/fixtures/unsub-tokens.json`) are made by the Python code with a throwaway test secret:
`python tools/unsub_fixtures.py <path to this repo>/tests/fixtures/unsub-tokens.json`, run in the Inbox repo.
