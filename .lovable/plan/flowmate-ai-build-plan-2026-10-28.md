# FlowMate AI — Build Plan

AI-powered no-code automation SaaS, built on this project's stack (TanStack Start + Tailwind + shadcn) with Lovable Cloud for database/auth and the Lovable AI Gateway for workflow generation.

Decisions from your answers: **each app user connects their own Google account** (App User Connectors), **email + password** login, and **core journey first**.

## Design direction

Match the reference screenshots: light B2B SaaS, white surfaces, light-grey borders (#E5E7EF), purple-blue accent (#635BEB), compact left sidebar (~220px), top toolbar, dotted-grid canvas with connected rectangular nodes, right inspector panel. All colors go into `src/styles.css` as oklch semantic tokens; Inter via a `<link>` in the root route.

## Phase 1 — Foundation

1. Enable Lovable Cloud. Enable email/password auth (`enable_email_auth`) and ask you whether signup should auto-confirm (default: confirmation email).
2. Migration `0001_flowmate_schema.sql`:
   - `profiles` (auto-created on signup via trigger: name, avatar initials, workspace name, timezone, default test mode, notification prefs)
   - `workspaces` + `workspace_members` (one personal workspace per user for now; `has_role` for ownership checks)
   - `integrations` (per-user connection metadata: provider, status, scopes, connected/reconnect-required)
   - `workflows` (name, description, status: draft/needs_configuration/active/paused/error, trigger type)
   - `workflow_versions` (numbered, definition JSONB validated in app code — never executable code)
   - `executions` + `execution_steps` (status, mode simulation|live, timings, sanitized node input/output, errors)
   - `usage_records` (executions, ai_generations)
   - `templates` (6 spec templates seeded as literal INSERTs in the migration)
   - `app_user_connections` (encrypted per-user Google connection keys, server-only access)
   - RLS on everything, scoped to workspace owner/members, plus GRANT blocks.
3. Auth pages: `/login`, `/signup`, `/reset-password` (with the recovery-hash password form), protected shell under `_authenticated/`, `/onboarding` for first-time workspace setup.
4. App shell: collapsible sidebar (logo, workspace dropdown, "+ Create Automation", MAIN/MANAGE/SETTINGS groups, user card), mobile drawer, top header with search + user menu. Every nav item routes to a real page.

## Phase 2 — Dashboard, automations, templates

- Dashboard: summary cards (total/active/executions this month/failed) computed from real tables; recent automations, recent activity, quick-start templates, Gmail/Sheets connection status, usage vs plan limits. Loading skeletons, empty states, error states.
- `/automations`: searchable/filterable list with status, trigger, last run, success rate; actions (open, rename, duplicate, test, activate, pause, delete with confirmation).
- `/templates`: gallery from seeded templates; "Use Template" copies the definition into a new workflow and opens the editor — never auto-activates.
- Central plan-limits config (Free/Pro/Business limits, no unlimited promises); usage checked before executions and AI generations.
- `/billing`: plan comparison and current usage; no real payments — clearly labelled as coming soon.

## Phase 3 — Visual workflow editor (top priority)

- Install `@xyflow/react` (+ Zustand for editor state). `@/automations/:id` route:
  - Toolbar: back, editable title, unsaved-changes indicator, undo/redo, add step, zoom/fit/minimap, Save, Test, Activate/Publish.
  - Canvas: dotted grid, pan/zoom, drag nodes, drag-from-handle connections with curved edges, selection highlight, node status colors, delete/duplicate, arrange action.
  - Node cards: icon, title, description, trigger/action badge, config status, status dot, more-menu. Node types (allowlist): `manual.trigger`, `schedule.trigger` (labelled: runs only on demand until scheduling ships), `gmail.new_email`, `gmail.send_email`, `google_sheets.new_row`, `google_sheets.add_row`, `google_sheets.find_row`, `ai.summarize`, `ai.extract`, `logic.filter`.
  - Right inspector: overview when nothing selected (status, nodes, integrations, validation, last test); per-node config forms with required-field validation, variable reference syntax `{{node_id.field}}` with existence validation, test-node where supported, delete.
  - Node picker: searchable categories (Triggers / Email / Spreadsheets / AI / Logic / Utilities) with availability status.
  - Validation panel with actionable errors; activation blocked until resolved.
  - Persistence: nodes, edges, configs, viewport, title saved to `workflow_versions`; explicit save + autosave with saving state, unsaved-changes warning on leave.

## Phase 4 — AI workflow generation

- "Create Automation" flow: describe task (example prompts), choose Build with AI / template / manual, review generated plan.
- Server function via Lovable AI Gateway (`openai/gpt-6-astra` on `/v1/responses`) with a strict `json_schema` output matching the Zod-validated workflow schema (name, description, trigger, nodes, edges, requiredIntegrations, missingConfiguration, explanation). Unsupported node types, bad edge references, and malformed output are rejected server-side; no model text is ever executed. One bounded retry on malformed JSON; graceful clarification prompt when the request is ambiguous.
- Review step shows summary, trigger, actions, required integrations, missing configuration, expected outcome, and buttons: Open Editor / Test / Save Draft. Never auto-activates.

## Phase 5 — Execution engine + history

- Server-side engine with a node-handler registry (only implemented handlers registered), topological order, per-node status/duration/sanitized output, bounded retries, timeouts, no cycles, usage recording.
- **Simulation mode** (default): deterministic sample data, simulated Gmail/Sheets adapters, results clearly labelled "Simulation" everywhere. **Live mode** only for steps whose integration is connected and authorized; unconnected live steps report "Waiting for account connection" — never faked.
- Test Workflow: validates, asks for sample trigger input, streams progress per node, shows failing node and error explanation, retry after fix.
- `/history`: filters (status, workflow, date range), execution detail with node timeline, sanitized inputs/outputs, error details, link to workflow; safe retry where supported.

## Phase 6 — Integrations (per-user Google)

- `/integrations` cards for Gmail (google_mail) and Google Sheets (google_sheets): connect/disconnect, required permissions, status including reconnect-required.
- When we reach this stage, an approval card will ask you to set up the Google OAuth App User Connector client (Google Cloud Console); I'll guide the callback URL (the Lovable gateway callback). Until that's configured, cards show "Setup required" and everything stays in labelled simulation mode.
- Per-user OAuth via connector gateway popup flow; connection keys stored **encrypted** in `app_user_connections`, keyed by the signed-in user ID; server-only provider calls (`callAsAppUser`) — Gmail read/send, Sheets list/read/append — never from the browser; disconnect revokes and deletes the stored key.

## Phase 7 — Settings, profile, polish

- `/settings` (profile, workspace, timezone, default test mode, notifications, connected accounts, delete-account request), `/profile`.
- Responsive checks (mobile drawer, usable editor on small screens), accessibility (labels, focus, confirmations), all pages get unique head metadata, no placeholder pages left.

## Phase 8 — Verification

- Typecheck/build clean; Playwright pass over the core journey: signup → onboarding → create workflow by AI prompt → canvas appears → add/configure nodes → save/reopen → validation errors shown → run simulation → history records it → dashboard metrics update.
- All spec rules with user-visible guarantees (simulation never shown as real, activation blocked on invalid config, per-user data isolation) get small tests next to `src/test/` and are run.

## Deferred to a later phase (recorded, not built now)

Real payments/Stripe, scheduled background execution of schedule triggers, version diffing/revision history UI, webhooks, more integrations (Slack, Notion, forms), team collaboration beyond owner-based workspaces, AI token-level usage display.
