# 📋 Ai8V Smart Research Library — White-Label Technical Specification

**Version:** 3.0
**Date:** 2026-03-12
**Author:** Ai8V Engineering

---

## 1. Product Definition

Ai8V Smart Research Library is a self-hosted, white-label conversational AI platform that allows educators, researchers, and institutions to deploy a private ChatGPT-like assistant trained exclusively on their own documents. The system ingests PDF, DOCX, and Markdown files through an automated pipeline, converts them into searchable vector embeddings, and serves a real-time Arabic-first chat interface powered by Google Gemini.

The platform is designed around a single principle: **one codebase, unlimited clients**. Each deployment is customized entirely through two files — `.env` for infrastructure secrets and `config.js` for branding and content — with zero code modifications required.

---

## 2. Architecture Overview

The system consists of three layers that operate independently and communicate through well-defined interfaces.

**Layer 1 — Ingestion Pipeline (Python).** This layer lives in the `pipeline/` directory and runs offline, typically once during initial setup and again whenever the client updates their source material. It performs sequential stages: extraction (converting raw documents to plain text), cleaning (normalizing Arabic text, removing noise), chunking (splitting text into semantically coherent segments of approximately 300–500 tokens), topic classification, embedding (converting chunks to 3072-dimensional vectors using Google's `gemini-embedding-001` model), and indexing (upserting vectors into a Qdrant collection with metadata). Each stage writes its output to a corresponding subdirectory under `pipeline/data/` and records a state file (`*_state.json`) so that re-running the pipeline skips already-processed files. The entire pipeline can be executed with a single command: `python pipeline/run_all.py --input ./data/input --collection ai8v_kb`.

**Layer 2 — Server (Node.js, ESM).** The server lives in the `server/` directory and handles three responsibilities. First, it serves the static frontend files from `frontend/`. Second, it exposes a REST API with four endpoints: `POST /api/chat` (accepts a user question and returns a streamed SSE response), `GET /api/topics` (returns available categories), `GET /api/health` (returns system status including Qdrant, Gemini, and cache stats), and `GET /api/config` (returns the public subset of `config.js` to the frontend). Third, it orchestrates the RAG (Retrieval-Augmented Generation) flow: receiving the user's question, embedding it via `gemini-embedding-001`, querying Qdrant for the top-5 most relevant chunks, constructing a prompt that includes those chunks as context, sending the prompt to `gemini-2.5-flash` via streaming, and forwarding each token to the client as an SSE event. The server uses no framework — it is built on Node's native `http` module with a custom router (`server/router.js`) and middleware for CORS (`server/middleware/cors.js`), rate limiting (`server/middleware/rateLimit.js`), and request validation (`server/middleware/validate.js`). An in-memory LRU cache (`server/services/cache.js`) caches complete responses for 1 hour (max 1000 entries) to reduce API calls.

**Layer 3 — Frontend (Vanilla JS, Single Page).** The frontend lives in the `frontend/` directory and consists of a single `index.html` page with modular JavaScript files. It reads all branding, text, and behavioral configuration from the `/api/config` endpoint at startup, falling back to hardcoded defaults in `config-client.js` if the API is unreachable. The chat interface supports RTL layout natively, renders assistant responses as formatted Markdown (headings, bold, lists, inline code) using a secure DOM-based renderer (no `innerHTML`), displays source citations as interactive chips below each answer, and provides a full-screen drawer for viewing source details. There is no sidebar; the UI is a single-column design optimized for readability. When a conversation starts (first message or restored session), the header and topics bar hide with a smooth animation and a floating "new chat" button (FAB) appears for navigation. When the conversation is cleared, the header returns.

---

## 3. Directory Structure (v3.0)

```
research-library/
├── .env                          # Secrets & per-client infra config (NEVER committed)
├── .env.example                  # Template for new deployments
├── .gitignore                    # Ignore rules
├── config.js                     # White-label config (ONLY file edited per client)
├── ecosystem.config.cjs          # PM2 process manager config (server + cloudflare tunnel)
├── package.json                  # Node dependencies
├── server.js                     # Entry point — imports dotenv/config + server/*
│
├── frontend/
│   ├── index.html                # Single-page app shell (CSP headers via meta tags)
│   ├── assets/
│   │   ├── css/style.css         # Complete UI stylesheet (dark emerald theme, ~1200 lines)
│   │   ├── fonts/                # Noto Sans Arabic Variable + Inter Variable (self-hosted)
│   │   └── img/                  # logo.png, fav16.png, fav32.png, fav180.png
│   └── assets/js/
│       ├── config-client.js      # Config loader — fetches /api/config with fallback defaults
│       ├── bootstrap.js          # Module initialization orchestrator (DOMContentLoaded)
│       ├── app.js                # AppModule — DOM refs, STATE, brand bootstrap, welcome/chat state
│       ├── chat.js               # ChatModule — send, SSE stream, render, history, clear
│       ├── sources.js            # SourcesModule — source chips (deduped, clean names) + drawer
│       ├── suggestions.js        # SuggestionsModule — welcome screen suggested questions
│       ├── topics.js             # TopicsModule — category filter bar (hideable via config)
│       ├── markdown.js           # MarkdownRenderer — secure MD→DOM (createElement only, no innerHTML)
│       └── header-scroll.js      # Header/topics hide animation + floating "new chat" FAB
│
├── server/
│   ├── router.js                 # Route definitions (4 API endpoints + 404)
│   ├── static.js                 # Static file server with MIME types
│   ├── middleware/
│   │   ├── cors.js               # Origin validation (ALLOWED_ORIGIN in production)
│   │   ├── rateLimit.js          # Per-IP rate limiting (chat: 10/min, topics: 30/min, health: 10/min)
│   │   └── validate.js           # Request body validation (size, JSON, message, history, topic_filter)
│   ├── handlers/
│   │   ├── chat.js               # POST /api/chat — RAG pipeline + SSE streaming + caching
│   │   ├── topics.js             # GET /api/topics — returns categories from Qdrant metadata
│   │   ├── health.js             # GET /api/health — Qdrant + Gemini + cache + system stats
│   │   └── configHandler.js      # GET /api/config — returns public config (cached at startup)
│   └── services/
│       ├── qdrant.js             # Qdrant client — search, scroll, getCollectionInfo (with timeouts)
│       ├── gemini.js             # Gemini client — embedText + streamGenerate (with custom errors)
│       └── cache.js              # In-memory LRU cache (max 1000 entries, TTL 1hr, auto-cleanup)
│
├── pipeline/                     # Python ingestion pipeline
│   ├── run_all.py                # Execute all stages sequentially
│   ├── extract.py                # Stage 1: Document → plain text
│   ├── clean.py                  # Stage 2: Arabic text normalization
│   ├── chunk.py                  # Stage 3: Semantic chunking
│   ├── topic.py                  # Stage 4: Topic classification
│   ├── embed.py                  # Stage 5: Vector embedding (gemini-embedding-001, 3072 dim)
│   ├── index.py                  # Stage 6: Qdrant upsert
│   ├── venv/                     # Python virtual environment (gitignored)
│   └── data/
│       ├── input/                # Client's raw documents (per-client)
│       ├── extracted/            # (generated, gitignored)
│       ├── cleaned/              # (generated, gitignored)
│       ├── chunks/               # (generated, gitignored)
│       ├── embedded/             # (generated, gitignored)
│       └── topics/               # (generated, gitignored)
│
├── qdrant_data/                  # Qdrant persistent storage (gitignored)
├── logs/                         # PM2 runtime logs (gitignored)
└── docs/                         # Documentation
```

---

## 4. Configuration Reference

### 4.1 .env — Infrastructure Secrets

| Variable | Purpose | Example |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key | `AIzaSyB...` |
| `QDRANT_URL` | Qdrant server address | `http://localhost:6333` |
| `QDRANT_COLLECTION` | Collection name in Qdrant | `ai8v_kb` |
| `PORT` | Server listening port | `3000` |
| `NODE_ENV` | Environment mode | `production` |
| `ALLOWED_ORIGIN` | CORS allowed origin | `https://chat.ai8v.com` |

### 4.2 config.js — White-Label Branding

The `config.js` file is organized into eight sections. Every text string, color, label, and behavioral parameter is defined here. The frontend fetches this configuration at startup via `/api/config` and applies it dynamically — no frontend files need editing. The entire config object is deep-frozen at export to prevent accidental mutation at runtime.

**BRAND** controls the visual identity: `name` (displayed in header), `tagline` (subtitle), `logo` (path to logo image), `primaryColor` (hex color for accents and CSS custom properties `--accent`, `--accent-dim`, `--accent-border`), and `domain` (client's domain).

**META** controls HTML metadata: `title` (browser tab title), `description` (meta description), `lang` (language code, default `ar`), `dir` (text direction, default `rtl`).

**LIBRARY** controls the knowledge base presentation: `totalFiles` (number of source documents, shown in welcome stats), `domainLabel` (scope label, e.g., "مكتبة بحثية ذكية"), `showTopics` (boolean to show/hide category filter bar — set to `false` to hide it entirely), `categories` (array of `{id, label}` objects for manual category definitions — if empty, categories are fetched from the API).

**CHAT** contains all UI strings: welcome titles and subtitle, placeholder text, button labels (`clearLabel`, `sendLabel`, `copyBtn`, `copiedBtn`), typing indicator text, error messages (network, timeout, rate limit, server, empty), and the `suggestions` array (4–6 questions shown on the welcome screen).

**CONFIDENCE** defines the threshold levels for answer confidence scoring: `level5` (min 0.92, "تطابق عالي جداً"), `level4` (min 0.82), `level3` (min 0.72), `level2` (min 0.60), `level1` (lowest), plus a `lowWarning` message displayed when confidence is below level 2.

**LIMITS** sets operational boundaries: `maxMessageChars` (default 500), `maxHistoryItems` (default 20), `streamDelay` (milliseconds between streamed tokens for visual effect, default 28).

**API** defines endpoint paths (`/api/chat`, `/api/topics`, `/api/health`, `/api/config`). These rarely change.

**SYSTEM_PROMPT** is the Arabic instruction set sent to Gemini with every request. It instructs the model to answer exclusively from the provided context, never fabricate information, never include file names or reference numbers (e.g., `[1]`, `[2]`) in the response (since sources are displayed automatically as chips), never insert questions within the answer, and respond in the same language as the question.

---

## 5. Technology Stack

| Component | Technology | Details |
|---|---|---|
| Server Runtime | Node.js 20+ | Native ESM, native `http` module, zero framework |
| Frontend | Vanilla JS (ES2020+) | No build step, no bundler, no framework |
| Styling | CSS3 | Custom properties for theming, dark emerald theme |
| Fonts | Noto Sans Arabic Variable + Inter Variable | Self-hosted in `frontend/assets/fonts/` |
| Vector Database | Qdrant | Self-hosted via Docker, Cosine similarity |
| Embedding Model | `gemini-embedding-001` | 3072 dimensions, via REST API |
| Generation Model | `gemini-2.5-flash` | Streaming via REST SSE, temperature 0.2 |
| Ingestion Pipeline | Python 3.10+ | pymupdf, python-docx, google-generativeai, qdrant-client |
| Process Manager | PM2 | Manages both Node server and Cloudflare Tunnel |
| Tunnel | Cloudflare Tunnel (`cloudflared`) | Exposes localhost to `chat.ai8v.com` |
| Dependencies (Node) | `@qdrant/js-client-rest`, `dotenv` | Two production dependencies only |

---

## 6. API Reference

### POST /api/chat
Accepts a user question and returns a streamed SSE response. Rate limited to 10 requests/minute per IP.

**Request body:**
```json
{
  "message": "string (1-500 chars, required)",
  "topic_filter": "string|null (optional)",
  "history": [{"role": "user|model", "text": "string"}]
}
```

**SSE events:**
- `{"text": "chunk"}` — Text delta during streaming
- `{"done": true, "sources": [...], "score": 0.75}` — Completion with sources and confidence
- `{"error": true, "message": "...", "code": "..."}` — Error

**Source object:**
```json
{
  "file": "filename.md",
  "section": "Section Title",
  "snippet": "First 150 chars...",
  "content": "Full chunk content",
  "score": 0.6912
}
```

### GET /api/topics
Returns available categories extracted from Qdrant metadata. Rate limited to 30/min.

### GET /api/health
Returns system status. Rate limited to 10/min.
```json
{
  "status": "ok|degraded",
  "qdrant": {"status": true, "points_count": 30},
  "gemini": {"status": true, "latency_ms": 598},
  "cache": {"size": 0, "hits": 0, "misses": 0, "hit_rate": "0.00%"},
  "system": {"uptime_sec": 597, "memory_mb": 79, "node_env": "production"},
  "brand": "Ai8V | Smart Research Library",
  "timestamp": "2026-03-12T21:23:42.799Z"
}
```

### GET /api/config
Returns the public subset of `config.js` (all sections except `SYSTEM_PROMPT`). Cached at startup with `Cache-Control: public, max-age=300`.

---

## 7. Security Model

**Content Security Policy** headers are defined in `index.html` via meta tags, restricting: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`. No `unsafe-inline` or `unsafe-eval` is permitted. All dynamic styling is done via CSS classes, not inline styles.

**CORS** middleware validates the `Origin` header against `ALLOWED_ORIGIN` in production. In development (`NODE_ENV=development`), localhost origins are permitted.

**Rate Limiting** is enforced per-IP (using `CF-Connecting-IP` header from Cloudflare, falling back to `socket.remoteAddress`): chat 10/min, topics 30/min, health 10/min. Expired entries are cleaned up every 5 minutes.

**Input Validation** middleware enforces: `Content-Type: application/json`, max body size 64KB, message 1–500 chars, history max 20 items with valid roles (`user`/`model`) and max 4000 chars per item, topic_filter max 64 chars.

**Markdown Renderer** uses only `document.createElement()` and `document.createTextNode()` — never `innerHTML` — to prevent XSS.

**User input** is capped at `maxMessageChars` (default 500) on both client and server.

**API keys** exist only in `.env` and are never exposed to the frontend. The `/api/config` endpoint excludes `SYSTEM_PROMPT`.

---

## 8. Frontend UI Behavior

**Welcome State:** On initial load (no session history), the user sees the full header (logo, brand name, tagline, connection status, "new chat" button), the topics bar (if `showTopics: true`), and the welcome screen with logo, title, subtitle, stats pill, and suggested questions.

**Chat State:** When the user sends the first message or a previous session is restored from `sessionStorage`, the header and topics bar slide up and fade out (CSS transition, 0.3s). A floating "new chat" button (FAB) appears in the top-right corner. The welcome screen is replaced by the messages list. Subsequent messages in the same session work seamlessly without page reload.

**Clear/New Chat:** Pressing the FAB or the header's "new chat" button clears the session history from `sessionStorage`, restores the welcome screen, and slides the header and topics bar back into view.

**Source Chips:** Each assistant response displays deduplicated source chips below the answer. Chips show a clean display name (section title, with `##` markdown prefixes stripped; or a humanized file name as fallback) — no percentage scores are shown on chips. Clicking a chip opens a drawer with full source details including the confidence score and original text.

**Session Persistence:** Conversation history is stored in `sessionStorage` (cleared when the browser tab closes). Maximum 20 messages are retained (FIFO).
