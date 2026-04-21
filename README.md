# Regen-AI — Streaming AI Chat (Next.js + OpenRouter + Prisma/Postgres)

Regen-AI is a **portfolio-grade, production-minded AI chat application** built with **Next.js (App Router)**. It supports **streaming responses** (token-by-token), integrates with **OpenRouter** for model access, and persists conversations in **PostgreSQL via Prisma**.

Unlike basic “chat demo” projects, Regen-AI intentionally focuses on the real-world concerns that show up in production LLM systems:
- **Streaming UX** for responsiveness and perceived latency
- **Retry + fallback streaming** for provider outages and rate limits
- **Persistence** for chat history and continuity
- **End-to-end testing with Playwright** that validates streaming + failure modes

---

## Demo

> Add screenshots/GIFs here (placeholders)

- `![Chat UI](docs/screenshots/chat-ui.png)`
- `![Streaming Response](docs/gifs/streaming.gif)`
- `![Error Handling](docs/screenshots/error-states.png)`

---

## Tech Stack

### Frontend
- Next.js 16 (App Router)
- React 19
- Tailwind CSS
- State/data utilities:
  - `@tanstack/react-query` (wired in `src/app/layout.js`)
- UX utilities:
  - `next-themes` (theme switching)
  - `sonner` (toast notifications)

### Backend (API Layer)
- Next.js Route Handlers (`src/app/api/**`)
- Streaming responses over an SSE-style response (`text/event-stream`)

### AI / LLM Integration
- OpenRouter provider via `@openrouter/ai-sdk-provider`
- `ai` SDK (`streamText`, `toUIMessageStreamResponse`, `convertToModelMessages`)
- System prompt in `src/lib/prompt.js`

### Persistence
- PostgreSQL (Docker Compose included)
- Prisma (`prisma/schema.prisma` defines `User`, `Chat`, `Message`)

### Testing
- Playwright E2E (`tests/chat.spec.js`)
- Dedicated Playwright dev server script (`scripts/playwright-dev.mjs`)

---

## Why This Project Stands Out

Most AI chat apps prove they can call an LLM. Regen-AI demonstrates **engineering depth** in the areas that matter for real systems:

- **Streaming-first UX** (not “submit → wait → render”)
- **Resilience by design**: retries + fallback streaming responses that keep UI stable
- **Persistence with schema design** (messages stored as normalized JSON parts)
- **Interview-ready testing**: E2E coverage for streaming, 500s, 429s, and empty outputs

---

## Architecture Overview (System + Data Flow)

### End-to-end request flow
1. User submits a prompt in the browser.
2. Frontend calls `POST /api/chat` with `messages` and optionally `chatId`.
3. API normalizes and validates messages, loads DB history when needed, and starts a streaming generation against OpenRouter.
4. The API streams incremental tokens back to the browser.
5. On completion, the server persists user/assistant messages (when `chatId` exists).

### Advanced Mermaid Diagram (with retry/fallback + persistence)
```mermaid
sequenceDiagram
autonumber
participant U as User
participant FE as Frontend (Next.js / React)
participant API as API (POST /api/chat)
participant R as Retry Controller
participant LLM as OpenRouter (AI Provider)
participant DB as Postgres (via Prisma)

U->>FE: Type prompt + Send
FE->>API: POST /api/chat { chatId?, model?, messages[] }

API->>API: Validate JSON + normalize UI messages
alt messages missing but chatId provided
  API->>DB: Load existing messages (Prisma)
  DB-->>API: Stored message history
end

API->>R: Start stream with retries (429 / 5xx)
loop attempt 1..N
  R->>LLM: streamText(model, systemPrompt, messages)
  alt provider success (stream begins)
    LLM-->>API: Stream chunks (text-delta...)
    API-->>FE: Stream chunks (text/event-stream)
  else retryable failure (429/5xx)
    R-->>R: Backoff delay
  else non-retryable failure
    R-->>API: Fail fast
  end
end

alt provider unavailable / rate-limited
  API-->>FE: Fallback streaming response (stable UX)
else stream completes successfully
  API->>DB: Persist user + assistant messages (Prisma createMany)
  DB-->>API: OK
end

FE-->>U: Progressive UI render + final message
```

---

## System Design Insights (Decisions, Trade-offs, Alternatives)

### Why streaming instead of polling?
**Why:** Streaming delivers the best “interactive” feel—users see the answer form progressively, which improves perceived latency and reduces abandonment for longer responses.

**Trade-offs:**
- Streaming increases complexity (partial renders, cancellation, UI consistency).
- Requires careful error handling (what happens mid-stream?).

**Alternatives:**
- **Polling**: simpler client logic but worse UX; adds extra server load and latency.
- **Single-shot response**: easiest to implement, but feels slow and brittle under long generations.

### Why retry logic exists?
LLM providers commonly fail transiently due to:
- **Rate limiting (429)**
- **Temporary upstream errors (5xx)**

Regen-AI retries only when it’s rational:
- Retryable: 429 / 5xx  
- Non-retryable: client payload issues (400s) or other hard failures

**Trade-offs:**
- Retries can amplify load under outages (“retry storms”) if uncontrolled.
- Adds latency in failure cases.

**Mitigations used here:**
- Bounded retries (`MAX_RETRIES`)
- Delay/backoff (`RETRY_DELAY_MS` scaled by attempt)

### Why fallback responses are streamed (instead of a plain JSON error)?
A plain error response often creates UI edge cases:
- “half-rendered” assistant message
- broken layout during stream parsing
- inconsistent chat transcript state

This repo intentionally returns a **fallback streaming response** for 429/5xx so the UI can follow one consistent path: “start → deltas → finish”, even in degraded mode.

**Trade-offs:**
- You may hide some raw error details (better for UX; not always best for debugging).
- Requires discipline to still log and surface correct server diagnostics.

---

## API Contract Examples

### `POST /api/chat`
Used by the chat UI to request a streamed completion.

**Request**
```json
{
  "chatId": "ckx123example",
  "model": "openai/gpt-4o-mini",
  "skipUserMessage": false,
  "messages": [
    {
      "id": "m1",
      "role": "user",
      "parts": [{ "type": "text", "text": "Explain the deployment plan." }]
    }
  ]
}
```

**Response**
- `Content-Type: text/event-stream; charset=utf-8`
- Streaming “events” (SSE-style). The UI receives a progression similar to:
  - `start`
  - `text-start`
  - repeated `text-delta`
  - `text-end`
  - `finish`

> Note: The backend will return a **fallback streaming response** (still `text/event-stream`) when the provider is rate-limited or unavailable, so the UI stays stable.

### `GET /api/ai/get-models`
Returns OpenRouter models filtered to those with **zero prompt + completion cost** (free).

**Response (shape)**
```json
{
  "models": [
    {
      "id": "openai/gpt-4o-mini",
      "canonical_slug": "openai/gpt-4o-mini",
      "name": "GPT-4o Mini",
      "description": "…",
      "context_length": 0,
      "architecture": { "modality": "unknown", "input_modalities": [], "output_modalities": [], "tokenizer": "Unknown" },
      "pricing": { "prompt": "0", "completion": "0", "request": "0", "image": "0", "web_search": "0", "input_cache_read": "0", "input_cache_write": "0" },
      "provider": { "id": "openai", "name": "OpenAI" },
      "top_provider": { "context_length": 0, "max_completion_tokens": 0, "is_moderated": false }
    }
  ]
}
```

---

## Project Structure

```text
.
├── docker-compose.yml               # Local Postgres (host:5433 -> container:5432)
├── playwright.config.js             # E2E config + webServer bootstrap
├── prisma/
│   ├── schema.prisma                # User/Chat/Message schema
│   └── migrations/
├── scripts/
│   ├── dev.mjs                      # Dev bootstrap: docker + prisma + next dev
│   └── playwright-dev.mjs           # Starts Next dev with PLAYWRIGHT_TEST=true
├── src/
│   ├── app/
│   │   ├── api/chat/route.js        # Streaming chat endpoint + retries + persistence
│   │   ├── api/ai/get-models/       # OpenRouter model discovery
│   │   └── api/auth/[...all]/       # Better Auth Next.js handler
│   └── lib/
│       ├── db.js                    # Prisma client
│       └── prompt.js                # Chat system prompt
└── tests/
    └── chat.spec.js                 # E2E: chat, streaming, 500, 429, empty output
```

---

## Setup & Installation

### Prerequisites
- Node.js (recent LTS or newer recommended)
- Docker (for Postgres)

### 1) Clone
```bash
git clone https://github.com/KunjMaheshwari/Regen-AI.git
cd Regen-AI
```

### 2) Install dependencies
```bash
npm install
```

### 3) Environment variables
Create `.env` in repo root (see next section).

### 4) Run locally
This script is intentionally “production-minded” for local dev:
- starts Postgres via Docker Compose
- generates Prisma client
- applies migrations
- starts Next.js dev server on `:3000`

```bash
npm run dev
```

Open: http://localhost:3000

---

## Environment Variables

| Variable | Required | Used By | Description |
|---------:|:--------:|:-------:|-------------|
| `OPENROUTER_API_KEY` | Yes | `/api/chat`, `/api/ai/get-models` | Auth to OpenRouter |
| `DATABASE_URL` | Yes | Prisma | Postgres connection string |

Example:
```bash
OPENROUTER_API_KEY=your_openrouter_api_key
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres
```

---

## Testing (Playwright E2E)

### Install browsers
```bash
npx playwright install
```

### Run tests
```bash
npm run test:e2e
```

### What is tested (current coverage)
`tests/chat.spec.js` validates:
- Chat prompt → streamed assistant response renders correctly
- Suggestion buttons populate the chat input
- Progressive streaming render (ensures no UI instability)
- Server failure (500) surfaces a stable, user-friendly error message
- Empty assistant response is handled gracefully
- Rate limit response (429) surfaces retry guidance

---

## Performance & Scalability (Interview Notes)

This project is built to be correct and resilient first, but the design choices translate well to higher scale.

### Handling high traffic
Potential pressure points:
- **Streaming connections** keep HTTP requests open longer than typical REST calls.
- Each active stream consumes server resources (concurrency limits matter).

How you’d scale it:
- Horizontal scale the Next.js server runtime (more instances).
- Enforce concurrency limits / request timeouts.
- Introduce per-user/IP throttling (especially for anonymous usage).

### Streaming performance considerations
- UI: streaming can cause frequent re-renders; consider throttling UI updates if needed.
- Server: logging per chunk is useful for debugging but can become expensive at scale—reduce verbosity or sample logs in production.

### Database scaling
Current behavior persists messages at the end of the stream.
At scale, you might:
- Batch writes (already effectively done via `createMany`)
- Add indexes tuned to query patterns (chatId + createdAt already appears in schema)
- Consider read replicas if chat history becomes read-heavy

### Caching strategies
- Cache `/api/ai/get-models` results (OpenRouter model list changes infrequently).
- Cache “system prompt” loading/config (small win, but reduces repeated work).
- Consider edge caching for non-user-specific endpoints.

### Potential bottlenecks
- OpenRouter latency/availability (mitigated via retries and fallbacks)
- Long-lived streaming responses under load
- Postgres connection limits (requires pooling in production deployments)

---

## Challenges & Learnings

### 1) Streaming + UI sync
**Challenge:** When responses arrive in chunks, the UI must stay consistent—no flicker, no duplicate assistant messages, no “half-finished” state.

**Solution:** Keep a consistent streaming contract and validate it with E2E tests that simulate real chunking using `ReadableStream`.

**Learning:** Streaming isn’t just a backend feature; it’s a full-stack correctness problem.

### 2) Provider failures and rate limiting
**Challenge:** LLM providers frequently return 429/5xx transient errors.

**Solution:** Implement bounded retries and return a fallback *stream* when the provider is degraded, keeping the client parsing and UI consistent.

**Learning:** A stable user experience often requires designing for failure as a “first-class” path, not an exception.

### 3) Empty/invalid responses
**Challenge:** “Successful” calls can still produce no useful assistant text (or malformed payloads).

**Solution:** Normalize message parts and guard against empty assistant messages (skip persistence + show a user-friendly UI error).

**Learning:** Validation and normalization are critical at boundaries—especially with multi-part chat payloads.

---

## Contributing (Optional)

1. Fork the repo
2. Create a branch
3. Run:
   ```bash
   npm run lint
   npm run test:e2e
   ```
4. Open a PR with a clear description and screenshots if UI changes

---

## License
No license file is currently included. If you plan to accept outside contributions or reuse, consider adding one (MIT/Apache-2.0/etc.).

---

## (Legacy) Next.js Template Notes
This project started from a Next.js template.
## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
