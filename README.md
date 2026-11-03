# FlowMate AI

FlowMate AI is a working no-code automation SaaS: a visual workflow editor, AI-assisted workflow generation, a persistent execution engine, Gmail/Google Sheets integrations, plan limits, and a clearly separated demo workspace.

This repository is a complete end-to-end implementation, not a static mockup. It was built and verified in a Termux/Android environment with Node.js 24 and SQLite.

---

## Contents

- [What works](#what-works)
- [Honest capability matrix](#honest-capability-matrix)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo login](#demo-login)
- [Production build and run](#production-build-and-run)
- [Project structure](#project-structure)
- [Routes](#routes)
- [Database and migrations](#database-and-migrations)
- [Execution engine](#execution-engine)
- [AI generation and AI steps](#ai-generation-and-ai-steps)
- [Google OAuth setup](#google-oauth-setup)
- [Demo mode](#demo-mode)
- [Plans and billing](#plans-and-billing)
- [API overview](#api-overview)
- [Security notes](#security-notes)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Verification performed](#verification-performed)

---

## What works

- Email/password signup, login, logout, session management, onboarding, workspace switching, and workspace creation.
- 12 allowlisted workflow node types with a React Flow editor:
  - Manual, schedule, Gmail, and Google Sheets triggers
  - Gmail send/search, Google Sheets add/find row, AI summarize/extract, filter, and delay actions
- Node configuration inspector, validation, node picker, insert-between-steps, delete step/connection, undo/redo, autosave/manual save, zoom, fit view, minimap, keyboard shortcuts, mobile inspector.
- AI workflow generation from a plain-language prompt, with a deterministic local planner fallback.
- Persistent workflow versions, activation/pause, test runs, manual runs, duplicate, export, and delete.
- SQLite-backed execution queue, scheduler, per-node logs, per-step retries, cancellation, retry of failed runs, and plan-aware history retention.
- Dashboard, automations list, templates, activity history, execution detail, integrations, connections, settings, billing, profile, help, and legal pages.
- Server-enforced plan limits, rate limits, same-origin checks, scrypt password hashing, hashed session tokens, httpOnly cookies, and AES-256-GCM token encryption.
- Demo workspace with seeded workflows, execution history, and labelled demo connections.

## Honest capability matrix

| Capability | Status |
| --- | --- |
| Simulation runs (no external calls) | Implemented and tested |
| Live Gmail read/send | Implemented, requires Google OAuth credentials |
| Live Google Sheets append/find row | Implemented, requires Google OAuth credentials |
| Gmail trigger watching an inbox continuously | **Not implemented.** The trigger reads the newest matching message when the workflow runs |
| Google Sheets new-row trigger | **Simulation only.** Live mode rejects it because Drive push channels are not implemented |
| AI workflow generation | Works with any OpenAI-compatible provider; deterministic local planner without a key |
| AI summarize/extract in live mode | Requires `AI_API_KEY`; fails clearly without it |
| Payments, invoices, subscriptions | **Not implemented.** The billing page switches plans for evaluation only |
| Email notifications / weekly digest | Preferences are stored, but no mail provider is connected |
| Branching, loops, parallel paths | **Not implemented.** Workflows are linear |
| Team invitations / RBAC beyond owner/member | Not implemented |
| Form/webhook triggers | Not implemented; manual trigger with sample input is used instead |
| Distributed or durable queue | Not implemented; the queue is in-process (see below) |
| Account deletion | Records a manual request; does not delete data |

Nothing in the UI claims that a simulated action was real. Demo connections, demo executions, and the shared demo account are labelled.

## Tech stack

- **Client:** React 18, TypeScript, Vite 6, Tailwind CSS, Lucide icons, `@xyflow/react` (React Flow), Zustand, React Hook Form, Zod, React Router.
- **Server:** Node.js, Express, TypeScript, Zod, `tsx` in development, esbuild for the production bundle.
- **Database:** SQLite through Node's built-in `node:sqlite` (`DatabaseSync`).
- **Auth:** scrypt password hashing, random session tokens stored as SHA-256 hashes, httpOnly `SameSite=Lax` cookie.
- **AI:** OpenAI-compatible `/chat/completions` endpoint with optional JSON response format, plus a deterministic local planner.
- **Google:** OAuth 2.0 authorization-code flow, refresh tokens, Gmail REST API, Sheets REST API.

### Why SQLite instead of Prisma/PostgreSQL

The target environment (Termux on Android) has no PostgreSQL or Redis service. The implementation uses Node's built-in SQLite driver with a hand-written relational schema and query layer. The schema is ordinary SQL and can be ported to PostgreSQL later; the application does not depend on SQLite-only query syntax beyond standard SQL.

## Quick start

Requirements:

- Node.js **22.5 or newer** (Node 24 recommended; `node:sqlite` must be available).
- npm 10+.

```bash
cd flowmate-ai
npm install
cp .env.example .env
npm run dev
```

`npm run dev` starts:

- API server: <http://localhost:8790>
- Vite client: <http://localhost:5173> (proxies `/api` to port 8790)

Open <http://localhost:5173>.

The database is created and seeded automatically on first start at `./data/flowmate.db` (or `DATABASE_PATH`). The seed creates six templates and a demo workspace with five workflows, execution history, and demo Gmail/Sheets connections.

Useful scripts:

```bash
npm run typecheck    # client + server TypeScript checks
npm run build        # typecheck + client bundle + server bundle
npm run db:seed      # seed templates/demo workspace if missing
npm run db:reset     # delete the SQLite files (restart to recreate + seed)
npm start            # run the production bundle from dist/
```

If port 8790 is occupied, set `PORT` in `.env` and update `VITE_API_TARGET` for the dev proxy.

## Demo login

With `DEMO_LOGIN_ENABLED=true` (default):

```text
Email:    demo@flowmate.ai
Password: demo1234
```

The demo account is **shared by everyone using the deployment**. It cannot change its password or be deleted. Its workspace (`Acme Studio (Demo)`, Pro plan) is separate from accounts created through signup, and all seeded records are marked as demo data.

Disable the demo login for a private deployment:

```dotenv
DEMO_LOGIN_ENABLED=false
```

Existing demo data remains in the database but the shared login is rejected.

## Production build and run

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

`npm start` runs `dist/server.mjs`, which serves both `/api/*` and the built SPA from `dist/client`. SPA routes fall back to `index.html`.

Set these in `.env` for a real deployment:

```dotenv
NODE_ENV=production
APP_URL=https://flowmate.example.com
API_PUBLIC_URL=https://flowmate.example.com
PORT=8790
TOKEN_ENCRYPTION_KEY=<openssl rand -base64 48>
DEMO_LOGIN_ENABLED=false
```

> `NODE_ENV=production` marks the session cookie `Secure`. Serve the app over HTTPS or authentication will not work.

## Project structure

```text
flowmate-ai/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json                 # client/shared TS config
├── tsconfig.server.json          # server TS config
├── .env.example
├── scripts/
│   ├── dev.mjs                   # runs API + Vite together
│   └── build-server.mjs          # esbuild JS API server bundle
├── shared/                       # code shared by client and server
│   ├── nodes.ts                  # allowlisted node catalog, fields, outputs
│   ├── workflow.ts               # Zod schemas, validation, layout, interpolation
│   ├── plans.ts                  # plan definitions and usage types
│   └── templates.ts              # seeded workflow templates
├── server/
│   ├── index.ts                  # Express app and entrypoint
│   ├── config.ts                 # environment configuration
│   ├── db.ts                     # SQLite schema, query helpers, transactions
│   ├── seed.ts                   # templates + demo workspace
│   ├── types.ts
│   ├── lib/                      # crypto, HTTP envelope, errors, rate limit
│   ├── middleware/               # session/auth and security middleware
│   ├── routes/                   # auth, dashboard, workflows, executions, ...
│   ├── services/                 # workflows, AI, Google, usage, executions
│   ├── engine/                   # runner, queue, scheduler, node handlers
│   └── scripts/                  # seed/reset CLIs
├── src/
│   ├── main.tsx / App.tsx
│   ├── components/               # layout, UI primitives, settings
│   ├── context/                  # auth context
│   ├── features/editor/          # Zustand editor store
│   ├── lib/                      # API client, types, utils, icons
│   └── pages/                    # all routes and editor page
├── data/                         # SQLite database (runtime, not source)
└── dist/                         # production build output
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page |
| `/login`, `/signup` | Authentication |
| `/onboarding` | First-run workspace and preference setup |
| `/dashboard` | Stats, recent automations, activity, integrations |
| `/automations` | Searchable/filterable workflow list |
| `/automations/new` | AI prompt, template, or blank creation |
| `/automations/:id` | Visual editor |
| `/templates` | Six reviewed starter templates |
| `/history` | Execution history with filters |
| `/history/:id` | Per-step execution log |
| `/integrations` | Gmail/Sheets OAuth, AI provider status |
| `/connections` | Connected and demo accounts |
| `/settings` | Profile, preferences, sessions, password, deletion request |
| `/settings/notifications` | Notification preferences |
| `/settings/workspace` | Workspace name, plan, creation |
| `/billing` | Usage meters and plan comparison |
| `/profile` | Account, workspace membership, sessions |
| `/help`, `/privacy`, `/terms`, `/contact` | Public documentation/legal pages |

The editor is rendered inside the authenticated shell but uses a full-height canvas layout.

## Database and migrations

SQLite files:

- `data/flowmate.db`
- `data/flowmate.db-wal`
- `data/flowmate.db-shm`

The schema is defined in `server/db.ts` and applied idempotently with `CREATE TABLE IF NOT EXISTS` on every start. There is no separate migration runner in this release. For schema changes, add an idempotent statement or a small versioned migration step before the application starts.

Tables:

| Table | Purpose |
| --- | --- |
| `users` | Account, password hash, avatar color, settings JSON, demo flag |
| `sessions` | Hashed session tokens, expiry, user agent |
| `workspaces` | Workspace name, plan, owner, demo flag |
| `workspace_members` | User/workspace membership and role |
| `integration_connections` | Per-workspace provider status and encrypted OAuth credentials |
| `workflows` | Workflow metadata, status, active version, last run, schedule anchor |
| `workflow_versions` | Immutable JSON definitions, one row per saved revision |
| `executions` | Run status, mode, trigger source, timing, error summary, demo flag |
| `execution_steps` | Per-node status, sanitized input/output, attempt, error |
| `execution_jobs` | Pending/processing/done/failed queue jobs |
| `usage_records` | Execution and AI-generation usage events |
| `templates` | Seeded template catalog |
| `trigger_state` | Trigger bookkeeping (reserved for future polling triggers) |
| `ai_generations` | AI generation attempts, source, success flag |
| `account_deletion_requests` | Manual deletion requests |

Reset the database:

```bash
npm run db:reset
# restart the server to recreate and seed
```

The reset removes the database, WAL, and SHM files. It is destructive.

## Execution engine

Flow: **queued → running → succeeded / failed / cancelled**

1. Creating a test/manual/scheduled run inserts an `executions` row and an `execution_jobs` row.
2. The in-process queue polls `execution_jobs` every `QUEUE_POLL_MS` (default 1.2s).
3. A job is claimed in an immediate transaction, then `runExecution` validates the saved version and executes nodes in topological order.
4. Each step records sanitized input/output, duration, attempt, and errors.
5. A failed step stops the run; remaining steps are recorded as skipped.
6. A filter that evaluates false stops the run successfully and records later steps as skipped.
7. Cancellation is checked between steps; completed steps keep their logs.
8. Failed executions can be retried as a new execution using the same workflow version and input.

Retries and timeouts:

- Retryable provider errors get **one retry per step** with a short backoff.
- Each step has a **65-second timeout**.
- The queue itself does not retry failed jobs. A failed job marks the execution failed.

Scheduler:

- `schedule.trigger` workflows are checked every `SCHEDULER_POLL_MS` (default 30s).
- Daily, weekly, and hourly schedules are evaluated in UTC.
- Each workflow stores a `scheduleAnchor` in metadata so the same occurrence is not enqueued twice.
- Scheduled runs are skipped when the workspace has reached its monthly execution limit.
- The scheduler only starts scheduled runs; it does not catch up on every missed occurrence after downtime.

**In-process queue limitation:** jobs live in SQLite, but the worker runs inside the web process. On restart, jobs left in `processing` are marked failed and their executions are marked failed with an explicit message. There is no Redis/BullMQ or separate worker in this release. Run a single server instance; do not scale horizontally against the same database with this queue.

## AI generation and AI steps

Configure an OpenAI-compatible provider:

```dotenv
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=30000
AI_DEMO_FALLBACK=true
```

- The server calls `${AI_BASE_URL}/chat/completions`.
- JSON mode is requested for planning/extraction where supported.
- The model receives a catalog of allowed node types and fields.
- The server rejects unknown node types, sanitizes every config value, enforces one trigger, and builds a linear chain.
- AI-generated code is never executed.
- If no key is configured, generation uses a deterministic keyword planner and the response is labelled `local-demo`.
- If a provider call fails and `AI_DEMO_FALLBACK=true`, the plan falls back to the local planner with a note. Set it to `false` to surface the provider error instead.
- AI action nodes in simulation mode use deterministic local summarization/extraction. In live mode without a key they fail with `ai_not_configured`; they never pretend to have called a model.

Prompts and generation outcomes are recorded in `ai_generations` and count toward the plan's AI generation limit.

## Google OAuth setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Gmail API** and **Google Sheets API**.
3. Configure the OAuth consent screen. While the app is in testing, add test users.
4. Create an **OAuth 2.0 Client ID → Web application**.
5. Add the exact redirect URI:
   ```text
   https://your-domain.example/api/integrations/google/callback
   ```
   For local development, use the API origin, not the Vite origin:
   ```text
   http://localhost:8790/api/integrations/google/callback
   ```
6. Set server environment variables:
   ```dotenv
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://your-domain.example/api/integrations/google/callback
   TOKEN_ENCRYPTION_KEY=<openssl rand -base64 48>
   APP_URL=https://your-domain.example
   API_PUBLIC_URL=https://your-domain.example
   ```
7. Restart the server and open **Integrations**.
8. Connect Gmail and Google Sheets separately. The OAuth state is bound to the signed-in user/workspace and expires after 10 minutes.

Scopes requested:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/spreadsheets`

Behavior and limitations:

- Access and refresh tokens are stored server-side only, encrypted with AES-256-GCM.
- If `TOKEN_ENCRYPTION_KEY` is unset, a built-in development key is used and the UI warns. Set a real key before connecting an account.
- **Test connection** refreshes the access token and updates the last-checked time.
- **Disconnect** removes local credentials and asks Google to revoke the refresh token. If revocation fails, the UI tells the user to revoke access manually at <https://myaccount.google.com/permissions>.
- Gmail triggers read the newest matching message when the workflow runs; they do not watch the inbox continuously. Use a schedule trigger to poll.
- Google Sheets new-row triggers are simulation-only.
- Live runs validate that the required provider is `connected`. Demo connections do not satisfy live validation.
- Without OAuth credentials, the Integrations page shows **Setup required** and simulation mode remains fully usable.

## Demo mode

There are two separate concepts:

1. **Simulation execution mode** — any workspace can run workflows with deterministic adapters. No Gmail or Sheets API is called, and no email is sent or row written.
2. **Demo workspace** — the seeded shared workspace reachable through the demo login. It contains five workflows, execution history, and demo connections. Records are flagged `is_demo` and labelled in the UI.

Demo connections (`status = demo`) never satisfy live validation and never perform external actions. Only the demo workspace can create them (`POST /api/integrations/:provider/demo-connect`); other workspaces receive `403 demo_only`.

Disabling the demo login does not delete the demo workspace. Use a fresh `DATABASE_PATH` or reset the database for a clean private deployment.

## Plans and billing

Plan definitions live in `shared/plans.ts` and are enforced server-side:

| Plan | Workflows | Executions/month | AI generations/month | History | Connections | Price |
| --- | --- | --- | --- | --- | --- | --- |
| Free | 3 | 100 | 20 | 7 days | 2 | $0 |
| Pro | 25 | 2,500 | 300 | 90 days | 5 | $19 |
| Business | 100 | 15,000 | 1,500 | 365 days | 10 | $49 |

Limits are checked when creating workflows, generating plans, creating executions, and connecting accounts. Usage resets each calendar month. History outside the retention window is hidden, not deleted early.

Billing is **not configured**. There is no payment provider, invoice, card form, or subscription. The billing page can change the workspace plan for evaluation, and the UI says so explicitly. In production (`NODE_ENV=production`) with the demo login disabled, plan changes are blocked with `503 billing_not_configured`.

## API overview

All API routes are under `/api` and return either `{ "data": ... }` or `{ "error": { "code", "message", "details" } }`.

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/demo`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/onboarding`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/change-password`, `GET /auth/bootstrap` |
| Dashboard | `GET /dashboard/summary`, `GET /dashboard/recent-activity` |
| Workflows | `GET/POST /workflows`, `GET/PATCH/DELETE /workflows/:id`, `POST /workflows/generate`, `POST /workflows/:id/validate`, `POST /workflows/:id/test`, `POST /workflows/:id/run`, `POST /workflows/:id/activate`, `POST /workflows/:id/pause`, `POST /workflows/:id/duplicate`, `GET /workflows/:id/executions`, `GET /workflows/:id/versions` |
| Executions | `GET /executions`, `GET /executions/:id`, `POST /executions/:id/retry`, `POST /executions/:id/cancel` |
| Templates | `GET /templates`, `GET /templates/:slug`, `POST /templates/:slug/instantiate` |
| Integrations | `GET /integrations`, `GET /integrations/connections`, `GET /integrations/google/connect`, `GET /integrations/google/callback`, `GET /integrations/:provider/status`, `POST /integrations/:provider/check`, `POST /integrations/:provider/demo-connect`, `POST /integrations/:provider/disconnect` |
| Settings | `GET/PATCH /settings`, `POST /settings/delete-request` |
| Usage/billing | `GET /usage`, `GET /billing/plans`, `POST /billing/change-plan` |
| Workspaces | `GET/POST /workspaces`, `POST /workspaces/:id/select`, `PATCH /workspaces/:id` |

## Security notes

- Passwords: scrypt (`N=16384, r=8, p=1`) with per-user salt, constant-time verification.
- Sessions: 32-byte random tokens; only SHA-256 hashes are stored. httpOnly, `SameSite=Lax`, `Secure` in production, 30-day expiry.
- OAuth state: signed into a short-lived httpOnly cookie and bound to the user, workspace, and provider.
- Origin checks on mutating requests; no-origin non-browser clients are allowed, which is safe for cookie auth because cookies are httpOnly and SameSite=Lax.
- Rate limits on auth, generation, test/run, check, and disconnect endpoints.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- OAuth tokens encrypted with AES-256-GCM; never sent to the browser.
- Step inputs/outputs are sanitized before storage, with secret-like keys redacted.
- No secrets are embedded in the client bundle.
- Zod validates every request body and every AI-generated workflow definition.

This project does not claim certification or perfect security. Review the deployment configuration, use HTTPS, set a strong `TOKEN_ENCRYPTION_KEY`, disable the demo login, and back up the database before public use.

## Environment variables

See `.env.example` for the full template.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | unset | `production` enables Secure cookies and production billing restrictions |
| `PORT` | `8790` | API/static server port |
| `APP_URL` | `http://localhost:5173` | Public SPA origin; used for OAuth return and origin checks |
| `API_PUBLIC_URL` | `http://localhost:${PORT}` | Public API origin; used for the default redirect URI |
| `DATABASE_PATH` | `./data/flowmate.db` | SQLite file path |
| `DEMO_LOGIN_ENABLED` | `true` | Enable the shared demo login |
| `DEMO_EMAIL` | `demo@flowmate.ai` | Demo account email |
| `DEMO_PASSWORD` | `demo1234` | Demo account password |
| `DEMO_NAME` | `Demo User` | Demo display name |
| `AI_API_KEY` | empty | OpenAI-compatible API key; empty enables the local planner |
| `AI_BASE_URL` | `https://api.openai.com/v1` | API root; `/chat/completions` is appended |
| `AI_MODEL` | `gpt-4o-mini` | Model name |
| `AI_TIMEOUT_MS` | `30000` | Provider request timeout |
| `AI_DEMO_FALLBACK` | `true` | Fall back to the local planner on provider failure |
| `GOOGLE_CLIENT_ID` | empty | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | empty | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `${API_PUBLIC_URL}/api/integrations/google/callback` | Must match Google Console exactly |
| `TOKEN_ENCRYPTION_KEY` | empty | AES-256-GCM key material; development key if unset |
| `QUEUE_POLL_MS` | `1200` | Queue poll interval |
| `SCHEDULER_POLL_MS` | `30000` | Schedule evaluation interval |
| `VITE_API_TARGET` | `http://localhost:8790` | Dev-only Vite proxy target |

`npm run dev` and `npm start` load `.env` automatically when present. Exported shell variables take precedence.

## Deployment

Recommended single-instance deployment:

```bash
npm ci
npm run build
NODE_ENV=production APP_URL=https://flowmate.example.com API_PUBLIC_URL=https://flowmate.example.com npm start
```

Put a TLS-terminating reverse proxy (Caddy, Nginx, or a platform load balancer) in front of port 8790. The proxy must forward cookies and preserve the `Host`/`Origin` headers.

Requirements and caveats:

- **One instance only.** The queue and scheduler run inside the web process. Multiple instances sharing one SQLite file can claim/execute duplicate work and are not supported.
- **Persistent volume** for the database directory. Include `-wal` and `-shm` files in backups, or checkpoint before copying.
- **HTTPS** when `NODE_ENV=production`, otherwise Secure cookies are rejected by browsers.
- **Exact OAuth redirect URI** in Google Cloud Console.
- **Outbound network access** for AI and Google APIs.
- No PostgreSQL, Redis, Docker, or external worker is required.
- `dist/client` must exist; `npm start` serves it. If it is missing, the server returns a plain API landing page.

Backup example (SQLite CLI, if available):

```bash
sqlite3 data/flowmate.db ".backup 'backup-flowmate.db'"
```

Or stop the server and copy `data/flowmate.db`, `flowmate.db-wal`, and `flowmate.db-shm` together.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `EADDRINUSE` on 8790 | Another process owns the port. Set `PORT` in `.env`; for the dev client, set `VITE_API_TARGET` to match. |
| Login succeeds but the session is not kept in production | You are on HTTP with `NODE_ENV=production`. Serve over HTTPS or unset `NODE_ENV` for local testing. |
| OAuth returns `oauth_not_configured` | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart. |
| OAuth returns `token_exchange_failed` | Redirect URI mismatch or invalid client secret. It must match exactly. |
| OAuth returns `state_mismatch` | The state cookie expired (10 min) or the flow started in another browser/session. Start again. |
| Integration shows **Setup required** | Google OAuth is not configured on the server. Simulation still works. |
| AI generation says **Local demo planner** | `AI_API_KEY` is unset or the provider failed with fallback enabled. |
| Live AI step fails with `ai_not_configured` | Set `AI_API_KEY`, or run in simulation mode. |
| Live run blocked by `integration_not_connected` | Connect the provider or switch to simulation. Demo connections do not count. |
| Execution stuck after restart | Expected with the in-process queue: interrupted jobs are marked failed. Retry the execution. |
| `Must use outdir when there are multiple input files` from esbuild | The esbuild CLI is broken in some Termux installs. This project uses `scripts/build-server.mjs` (esbuild JS API), so use `npm run build:server`, not the CLI. |
| Database locked | Ensure only one server instance is running. `busy_timeout` is 5 seconds. |
| Demo data in a private deployment | Reset the database or point `DATABASE_PATH` at a new file, then disable `DEMO_LOGIN_ENABLED`. |

## Verification performed

The implementation was verified with:

- `npm run typecheck` — client and server pass.
- `npm run build` — Vite client bundle and esbuild server bundle succeed.
- Production bundle started on an isolated port and database; `/api/health`, `/`, and an SPA fallback route returned `200`.
- API journey covering health, demo login/session, dashboard, workflow list/detail/save, local AI planning, simulation test, activation, manual run, pause, duplicate, history/detail, cancellation, validation failure, template instantiation, integration status/demo-connect, settings, usage, billing, and cleanup.
- Separate auth journey covering signup, session, empty dashboard, onboarding, logout invalidation, login, wrong-password `401`, and duplicate-signup `409`.

Live AI and live Google calls were **not** exercised because no credentials are configured in this environment. Those paths are implemented and surface clear setup-required errors when unconfigured.

---

FlowMate AI is an independent project. Gmail and Google Sheets are trademarks of Google LLC.
