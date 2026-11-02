# FlowMate AI

FlowMate AI is a working AI-assisted, no-code automation app. You describe a task in
plain language (or start from a template), review the generated workflow on a visual
canvas, configure every step, validate it, run a test, and inspect the results in
execution history.

The first release ships with Gmail and Google Sheets steps plus AI summarize/extract
and a filter condition. Every button in the app performs a real action: data is stored
in Supabase, workflow definitions are versioned, and executions are recorded node by
node.

## Stack

- React 19 + TypeScript + Vite
- TanStack Start (file-based routes + server functions as the backend API)
- Tailwind CSS + shadcn/Radix UI + Lucide icons
- `@xyflow/react` for the workflow editor, Zustand for editor state
- Supabase (Postgres, Auth, RLS) for persistence
- Zod for input/definition validation
- Vitest for unit tests

## Quick start

```sh
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

Open the printed local URL, sign up, finish the short onboarding wizard, and create
your first automation.

### Required environment variables

Supabase is required. The rest are optional; the app degrades honestly when they are
missing.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL (server) |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable/anon key (server) |
| `VITE_SUPABASE_URL` | yes | Same URL, exposed to the browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Same key, exposed to the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | for integrations | Admin client used only by server functions (never shipped to the browser) |
| `APP_USER_CONNECTION_KEY_SECRET` | for integrations | Base64 32-byte key used to encrypt stored OAuth credentials server-side |
| `AI_API_KEY` | optional | Any OpenAI-compatible API key |
| `AI_BASE_URL` | optional | Base URL of the OpenAI-compatible API, e.g. `https://api.openai.com/v1` |
| `AI_MODEL` | optional | Model name, defaults to `gpt-4o-mini` for OpenAI-compatible providers |
| `LOVABLE_API_KEY` | optional | Lovable AI Gateway fallback and connector gateway access |
| `GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY` | optional | Gmail connector client key from App User Connectors |
| `GOOGLE_SHEETS_APP_USER_CONNECTOR_CLIENT_API_KEY` | optional | Google Sheets connector client key |
| `LOVABLE_CRON_SECRET` | not used yet | Reserved for future background scheduling |

`.env` is committed with publishable Supabase values only. Never add a service-role
key, AI key, or connector secret to a `VITE_` variable — anything prefixed `VITE_` is
shipped to the browser.

## Database setup

The schema lives in `drizzle/migrations/0000_flowmate_schema.sql`. Apply it once to a
new Supabase project, either in the Supabase SQL editor or with:

```sh
psql "$SUPABASE_DB_URL" -f drizzle/migrations/0000_flowmate_schema.sql
```

It creates the tables, enums, RLS policies, the profile-on-signup trigger, and seed
templates. Auth uses email + password. If email confirmation is enabled in Supabase,
confirm the address before signing in. Add your deployed origin (and
`http://localhost:5173` during development) to the Supabase Auth redirect URLs so
password-reset links return to `/reset-password`.

## Demo mode (no AI key needed)

AI generation is optional. When no AI provider is configured:

- “Generate with AI” returns a deterministic starter plan built from keywords in your
  description.
- The plan is labelled **Demo plan — no AI provider configured**; it is never
  presented as model output.
- Simulation runs use deterministic sample data and mark each AI step with
  `simulated: true` and `ai_fallback: true`.

This means you can exercise the whole journey — auth → onboarding → dashboard →
create → edit → validate → test → history — without any external credentials.

## Integrations

Gmail and Google Sheets use the Lovable connector gateway with per-user OAuth. To
enable live connections:

1. Create App User Connectors for Google Mail and Google Sheets and configure the
   required scopes:
   - Gmail: `gmail.readonly`, `gmail.send`
   - Sheets: `spreadsheets`
2. Set `LOVABLE_API_KEY`,
   `GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY`,
   `GOOGLE_SHEETS_APP_USER_CONNECTOR_CLIENT_API_KEY`, and
   `APP_USER_CONNECTION_KEY_SECRET` on the server.
3. Open **Integrations** in the app and connect each provider.

If setup is incomplete, the Integrations page shows **Setup required** instead of a
broken Connect button. Connections are verified against the provider before being
reported as connected. Simulations work without any connection; live runs and
activation are blocked until the required accounts are connected.

## What is implemented

- Email/password auth, sign-up, sign-in, sign-out, password reset, and an onboarding
  gating flow.
- Dashboard with workspace-scoped counts, active workflows, plan usage, recent
  executions, recent automations and templates.
- Automations list with search, status filters, rename, duplicate, activate/pause,
  delete (with confirmation), and test.
- Three creation paths: AI prompt (real provider or labelled demo plan), template, or
  manual blank workflow.
- Visual editor with dotted canvas, connected rectangular nodes, compact toolbar,
  right inspector, node picker, minimap, zoom/fit, undo/redo, keyboard shortcuts,
  autosave plus explicit save, unsaved-change protection, node/edge deletion.
- Inspector forms for every node type, mapping/field editors, available-variable
  insertion, and inline validation issues.
- Server-side definition validation: trigger presence, duplicate ids, dangling edges,
  self-loops, cycles, required fields, unknown variable references, unsupported node
  types, and integration requirements.
- Execution engine with an allowlisted handler registry, Kahn topological ordering
  reachable from the trigger, per-node timeouts, bounded retries with backoff for
  transient provider errors, branch skipping when a filter fails, per-node logs, and
  redaction/truncation of sensitive or oversized data.
- Simulation and live modes. Live actions call the real Gmail/Sheets APIs; simulation
  never sends email or writes rows and always labels results as simulated.
- Activity history with status filters, per-node input/output, durations, retry
  attempts, error details, retry and deep links.
- Integrations page with setup detection, connect/disconnect, verification, and
  reconnect-required states.
- Settings, profile/password, billing/usage, and help pages.
- Unit tests for schema normalization/validation and engine ordering/branch
  behavior/redaction.

## Known limitations

These are deliberate and surfaced in the UI rather than faked:

- **No background scheduler or job queue.** The schedule trigger runs on demand only;
  it is labelled “On demand” in the node picker. Do not expect cron-style execution.
- **Billing is informational.** Plans and limits are enforced in the app, but there is
  no payment provider checkout. Upgrade buttons are not presented as completed
  purchases.
- **One owner per workspace.** Workspace membership/team sharing is not implemented.
- **Two integrations only.** Gmail and Google Sheets. Other providers are not listed.
- **No inbound webhooks yet.** Gmail and Sheets triggers read the latest matching
  item on demand, not via push notifications.

## Scripts

```sh
npm run dev        # start the dev server
npm run build      # production build (Nitro output in .output)
npm run preview    # preview the production build
npm run test       # run Vitest once
npm run test:watch # watch mode
npm run lint       # ESLint
npm run format     # Prettier
```

`npx tsc --noEmit` passes, `npm run test` passes, and `npm run build` produces a
deployable build.

## Deployment

The build emits a Nitro server plus static assets in `.output`:

```sh
npm run build
npx nitro deploy --prebuilt
```

You can also deploy through Lovable, which syncs the connected branch. Any host that
can run a Node server or the generated Cloudflare worker works. Set the same server
environment variables in the hosting dashboard, keep `SUPABASE_SERVICE_ROLE_KEY` and
connector secrets server-only, and add the production URL to Supabase Auth redirect
URLs.

## Project map

```
src/
  components/editor/      workflow editor store, nodes, inspector, picker, test panel
  components/flowmate/    app shell, logo, page header
  components/ui/          shadcn/Radix primitives
  integrations/           Supabase clients and connector gateway helpers
  lib/
    workflow-schema.ts    node allowlist, specs, normalization, validation, templating
    engine.server.ts      registered handlers, topological execution, retries, sanitize
    executions.functions.ts  test/run/retry/history server functions
    workflows.functions.ts   CRUD, versions, activation, templates, dashboard
    ai.functions.ts       AI generation + deterministic demo plan
    ai.server.ts          OpenAI-compatible / Lovable AI Gateway client
    connector-adapters.server.ts  Gmail + Sheets live adapters
    oauth.functions.ts    connector OAuth start/complete/verify/disconnect
  routes/                 all app routes (see list below)
  test/                   Vitest setup and unit tests
drizzle/migrations/       Supabase schema + seed data
```

Routes: `/`, `/login`, `/signup`, `/onboarding`, `/dashboard`, `/automations`,
`/automations/new`, `/automations/:id`, `/templates`, `/history`, `/integrations`,
`/settings`, `/billing`, `/profile`, `/help`, and `/reset-password`.
