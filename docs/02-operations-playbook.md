# 📋 Operations Playbook — Client Lifecycle Management

**Version:** 3.0
**Date:** 2026-03-12

---

## 1. Adding a New Client (Full Deployment)

This procedure assumes you have a clean server (Ubuntu 22.04+ or similar) with Node.js 20+, Python 3.10+, Docker, and Qdrant installed.

**Step 1 — Clone and Install.** Clone the repository to the server. Run `npm install` for Node dependencies. Create a Python virtual environment inside `pipeline/` and install requirements: `cd pipeline && python -m venv venv && source venv/bin/activate && pip install pymupdf python-docx google-generativeai qdrant-client`.

**Step 2 — Create .env.** Copy `.env.example` to `.env`. Fill in the client's Gemini API key, Qdrant connection details (`QDRANT_URL=http://localhost:6333`), desired port, the client's domain as `ALLOWED_ORIGIN` (with `https://`), set `NODE_ENV=production`, and choose a unique `QDRANT_COLLECTION` name for this client (e.g., `client_dr_ahmed_fiqh`).

**Step 3 — Configure Branding.** Edit `config.js` with the client's brand name, tagline, logo path, primary color, domain, welcome text, suggested questions, and system prompt. Set `LIBRARY.showTopics` to `true` or `false` depending on whether the client needs category filtering. Replace `frontend/assets/img/logo.png` and favicons with the client's branding assets.

**Step 4 — Ingest Documents.** Place the client's source documents (PDF, DOCX, or MD) in `pipeline/data/input/`. Activate the Python environment and run the pipeline:
```
cd pipeline
source venv/bin/activate
python3 run_all.py --input ./data/input --collection <COLLECTION_NAME>
deactivate
```
Monitor output for errors. Verify by checking: `curl -s http://localhost:6333/collections/<COLLECTION_NAME> | python3 -m json.tool`.

**Step 5 — Start the Server.** Use PM2: `pm2 start ecosystem.config.cjs --env production`. Verify with `pm2 status` and `curl -s http://localhost:<PORT>/api/health | python3 -m json.tool`.

**Step 6 — Configure Tunnel/Proxy.** For Cloudflare Tunnel: configure `cloudflared` to route the client's domain to the local port. The tunnel process is managed by PM2 alongside the server (see `ecosystem.config.cjs`). Alternatively, use Nginx or Caddy as a reverse proxy with SSL via Certbot/Let's Encrypt.

**Step 7 — Verify.** Open the client's domain in a browser. Confirm the welcome screen shows their branding. Send a test question. Verify: Markdown formatting renders correctly, source chips show clean names without percentages, clicking a chip opens the drawer with details, sending a second question in the same session works, and the "new chat" FAB appears when the header is hidden.

---

## 2. Updating a Client's Documents

When a client provides new or updated documents:

1. Place new files in `pipeline/data/input/`. If replacing all content, clear the input directory first and add only the new files.
2. Clear the pipeline's generated data:
   ```
   cd ~/research-library/pipeline
   rm -rf data/extracted/* data/cleaned/* data/chunks/* data/embedded/* data/topics/*
   rm -f data/*_state.json
   ```
3. If doing a full replacement, also drop the Qdrant collection:
   ```
   curl -X DELETE http://localhost:6333/collections/<COLLECTION_NAME>
   ```
4. Run the full pipeline:
   ```
   source venv/bin/activate
   python3 run_all.py --input ./data/input --collection <COLLECTION_NAME>
   deactivate
   ```
5. Update `config.js` if the number of files changed (`LIBRARY.totalFiles`).
6. Restart the server: `pm2 restart research-library`.

No extended downtime is needed — the next chat query will use the updated vectors.

---

## 3. Modifying a Client's Branding

Edit `config.js` and replace image assets in `frontend/assets/img/`. Restart the server with `pm2 restart research-library`. No pipeline re-run is needed — branding changes are purely frontend/config.

---

## 4. Modifying a Client's System Prompt

Edit the `SYSTEM_PROMPT` section in `config.js`. Restart the server. The new prompt takes effect on the next chat request — no pipeline re-run needed. Note: cached responses will still use the old prompt until they expire (1 hour TTL) or the server is restarted (which clears the in-memory cache).

---

## 5. Removing a Client

1. Stop the PM2 processes: `pm2 stop <app-name> && pm2 delete <app-name>`.
2. Drop the Qdrant collection: `curl -X DELETE http://localhost:6333/collections/<collection_name>`.
3. Remove tunnel/proxy configuration.
4. Archive or delete the project directory.

---

## 6. Monitoring and Maintenance

Server logs are accessible via `pm2 logs research-library`. Qdrant health can be checked at `http://localhost:6333/dashboard`. The `/api/health` endpoint returns comprehensive status (Qdrant connectivity and point count, Gemini connectivity and latency, cache hit rate, system uptime and memory, Node environment) and can be used with uptime monitors (e.g., UptimeRobot, Healthchecks.io). The in-memory cache auto-cleans expired entries every 10 minutes, and rate limiter entries are cleaned every 5 minutes. Periodically update Node.js dependencies with `npm audit` and Python dependencies within the virtual environment.

---

## 7. Common Troubleshooting

**"Port already in use"** — Another process occupies the port. Run `fuser -k <PORT>/tcp` or change the port in `.env`.

**403 on /api/chat** — CORS mismatch. Verify `ALLOWED_ORIGIN` in `.env` matches the exact origin (protocol + domain, no trailing slash). In development, set `NODE_ENV=development` to allow localhost.

**429 Too Many Requests** — Rate limit exceeded. Chat allows 10 requests/minute per IP. Wait and retry. If testing, temporarily increase limits in `server/middleware/rateLimit.js`.

**Empty responses / "حدث خطأ في المعالجة"** — Check `pm2 logs research-library` for errors. Common causes: Gemini API quota exceeded (429 from Google — need new API key or wait for quota reset), Qdrant collection empty or missing (re-run pipeline), network issues to Google APIs.

**Gemini quota exceeded** — The free tier has limited requests per minute. Either wait for the quota to reset (usually 1 minute), switch to a new API key, or enable billing on Google AI Studio for higher limits.

**Second question not working** — If this occurs, verify that `chat.js` uses element references (not `document.getElementById`) for assistant message components. The v3.0 `_buildAssistantSkeleton()` returns a refs object instead of using static IDs.

**Markdown not rendering** — Ensure `markdown.js` is loaded before `chat.js` in `index.html`. Check browser console for "MarkdownRenderer is not defined".

**Source chips showing ## or percentages** — Verify `sources.js` v3.0 is deployed. The `_displayName()` function strips `#` prefixes from section titles, and `buildSourceChips()` no longer renders score spans.

**Inline styles blocked by CSP** — The CSP policy does not allow `unsafe-inline` for styles. All dynamic styling must use CSS classes, not inline `style` attributes.

**Categories/topics bar still showing** — Set `LIBRARY.showTopics: false` in `config.js` and restart the server.
