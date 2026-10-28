-- ============ FlowMate AI core schema ============

create type public.app_role as enum ('admin', 'moderator', 'user');
create type public.workflow_status as enum ('draft', 'needs_configuration', 'active', 'paused', 'error');
create type public.execution_status as enum ('queued', 'running', 'waiting', 'succeeded', 'partially_succeeded', 'failed', 'cancelled');
create type public.execution_mode as enum ('simulation', 'live');
create type public.integration_provider as enum ('google_mail', 'google_sheets');
create type public.integration_status as enum ('not_connected', 'connected', 'reconnect_required', 'setup_required');

-- user roles (protected table, only table besides profiles referencing auth.users)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  workspace_name text not null default 'My Workspace',
  timezone text not null default 'UTC',
  default_test_mode text not null default 'simulation',
  notify_execution_failures boolean not null default true,
  notify_weekly_summary boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;
create policy "owners manage workspaces" on public.workspaces for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;
create policy "members see own memberships" on public.workspace_members for select to authenticated using (user_id = auth.uid());
create policy "owners manage members" on public.workspace_members for all to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.workspaces w
    where w.id = _workspace_id and (w.owner_id = _user_id or exists (
      select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = _user_id))
  )
$$;

-- integrations (per-user connection metadata; credentials live server-side only)
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider public.integration_provider not null,
  status public.integration_status not null default 'not_connected',
  scopes text[] not null default '{}',
  account_label text,
  connected_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);
grant select, insert, update, delete on public.integrations to authenticated;
grant all on public.integrations to service_role;
alter table public.integrations enable row level security;
create policy "users manage own integrations" on public.integrations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- workflows
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  status public.workflow_status not null default 'draft',
  trigger_type text,
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workflows to authenticated;
grant all on public.workflows to service_role;
alter table public.workflows enable row level security;
create policy "members manage workflows" on public.workflows for all to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()))
  with check (public.is_workspace_member(workspace_id, auth.uid()));
create index workflows_workspace_idx on public.workflows (workspace_id, updated_at desc);

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.workflows(id) on delete cascade not null,
  version integer not null,
  definition jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);
grant select, insert on public.workflow_versions to authenticated;
grant all on public.workflow_versions to service_role;
alter table public.workflow_versions enable row level security;
create policy "members manage versions" on public.workflow_versions for all to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_id and public.is_workspace_member(w.id, auth.uid())))
  with check (exists (select 1 from public.workflows w where w.id = workflow_id and public.is_workspace_member(w.id, auth.uid())));

-- executions
create table public.executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.workflows(id) on delete cascade not null,
  workflow_version_id uuid references public.workflow_versions(id) on delete set null,
  status public.execution_status not null default 'queued',
  mode public.execution_mode not null default 'simulation',
  trigger_payload jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_summary text
);
grant select, insert, update on public.executions to authenticated;
grant all on public.executions to service_role;
alter table public.executions enable row level security;
create policy "members manage executions" on public.executions for all to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_id and public.is_workspace_member(w.id, auth.uid())))
  with check (exists (select 1 from public.workflows w where w.id = workflow_id and public.is_workspace_member(w.id, auth.uid())));
create index executions_workflow_idx on public.executions (workflow_id, started_at desc);

create table public.execution_steps (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid references public.executions(id) on delete cascade not null,
  node_id text not null,
  node_type text not null,
  status public.execution_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  input jsonb,
  output jsonb,
  error_code text,
  error_message text
);
grant select, insert, update on public.execution_steps to authenticated;
grant all on public.execution_steps to service_role;
alter table public.execution_steps enable row level security;
create policy "members manage steps" on public.execution_steps for all to authenticated
  using (exists (select 1 from public.executions e join public.workflows w on w.id = e.workflow_id where e.id = execution_id and public.is_workspace_member(w.id, auth.uid())))
  with check (exists (select 1 from public.executions e join public.workflows w on w.id = e.workflow_id where e.id = execution_id and public.is_workspace_member(w.id, auth.uid())));
create index execution_steps_exec_idx on public.execution_steps (execution_id);

-- usage
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  usage_type text not null,
  quantity integer not null default 1,
  recorded_at timestamptz not null default now()
);
grant select, insert on public.usage_records to authenticated;
grant all on public.usage_records to service_role;
alter table public.usage_records enable row level security;
create policy "members read own usage" on public.usage_records for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "members record usage" on public.usage_records for insert to authenticated
  with check (public.is_workspace_member(workspace_id, auth.uid()));
create index usage_records_ws_idx on public.usage_records (workspace_id, recorded_at desc);

-- templates
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null,
  category text not null,
  complexity text not null default 'simple',
  definition jsonb not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.templates to authenticated;
grant all on public.templates to service_role;
alter table public.templates enable row level security;
create policy "authenticated read templates" on public.templates for select to authenticated using (is_published);

-- encrypted per-user connector keys (server-only access)
create table public.app_user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  connector_id text not null,
  connection_key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector_id)
);
grant all on public.app_user_connections to service_role;
alter table public.app_user_connections enable row level security;

-- signup trigger: profile + personal workspace + owner membership
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  ws_name text;
begin
  insert into public.profiles (id, display_name, workspace_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 'My Workspace')
  returning public.profiles.id into new_id;

  ws_name := coalesce(new.raw_user_meta_data->>'workspace_name', 'My Workspace');
  insert into public.workspaces (name, owner_id) values (ws_name, new_id);
  insert into public.workspace_members (workspace_id, user_id, role)
  select w.id, new_id, 'owner' from public.workspaces w where w.owner_id = new_id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- seed templates
insert into public.templates (slug, name, description, category, complexity, definition) values
('email-to-sheets', 'Email to Google Sheets', 'When a matching email arrives, extract its details and append a row to a spreadsheet.', 'Email', 'simple', '{"name":"Email to Google Sheets","description":"Extract details from matching emails and store them in a spreadsheet.","trigger":{"id":"trigger_1","type":"gmail.new_email","config":{"filter":""}},"nodes":[{"id":"extract_1","type":"ai.extract","config":{"source":"{{trigger_1.body}}","fields":["sender","subject","date"]}},{"id":"sheets_1","type":"google_sheets.add_row","config":{"row":{"sender":"{{extract_1.sender}}","subject":"{{extract_1.subject}}","date":"{{extract_1.date}}"}}}],"edges":[{"source":"trigger_1","target":"extract_1"},{"source":"extract_1","target":"sheets_1"}],"requiredIntegrations":["google_mail","google_sheets"],"explanation":"New emails are processed, key fields are extracted, and each result becomes a spreadsheet row."}'),
('lead-capture', 'Lead Capture & Notification', 'Save new lead details and prepare a confirmation email to the contact.', 'Sales', 'simple', '{"name":"Lead Capture & Notification","description":"Store lead details and prepare a follow-up confirmation email.","trigger":{"id":"trigger_1","type":"manual.trigger","config":{"sampleInput":{"name":"Jane Doe","email":"jane@example.com","company":"Acme"}}},"nodes":[{"id":"filter_1","type":"logic.filter","config":{"field":"{{trigger_1.email}}","operator":"contains","value":"@"}},{"id":"sheets_1","type":"google_sheets.add_row","config":{"row":{"name":"{{trigger_1.name}}","email":"{{trigger_1.email}}","company":"{{trigger_1.company}}"}}},{"id":"gmail_1","type":"gmail.send_email","config":{"to":"{{trigger_1.email}}","subject":"Thanks for reaching out","body":"Hi {{trigger_1.name}}, thanks for your interest! We will be in touch shortly."}}],"edges":[{"source":"trigger_1","target":"filter_1"},{"source":"filter_1","target":"sheets_1"},{"source":"sheets_1","target":"gmail_1"}],"requiredIntegrations":["google_sheets","google_mail"],"explanation":"Each manually submitted lead is validated, stored in a spreadsheet, and gets a confirmation email."}'),
('daily-summary', 'Daily Summary Report', 'Summarize recent messages into a digest you can review each morning.', 'Productivity', 'medium', '{"name":"Daily Summary Report","description":"Summarize recent messages into a readable digest.","trigger":{"id":"trigger_1","type":"manual.trigger","config":{"sampleInput":{"window":"24h"}}},"nodes":[{"id":"gmail_1","type":"gmail.new_email","config":{"filter":"is:inbox"}},{"id":"ai_1","type":"ai.summarize","config":{"source":"{{gmail_1.body}}","style":"bullet-points","maxLength":200,"outputVariable":"digest"}}],"edges":[{"source":"trigger_1","target":"gmail_1"},{"source":"gmail_1","target":"ai_1"}],"requiredIntegrations":["google_mail"],"explanation":"Recent messages are gathered and condensed into a short bullet-point digest."}'),
('sheet-validation', 'Spreadsheet Data Validation', 'Check new spreadsheet rows for missing required fields and flag problems.', 'Data', 'simple', '{"name":"Spreadsheet Data Validation","description":"Validate new rows and flag missing fields.","trigger":{"id":"trigger_1","type":"google_sheets.new_row","config":{}},"nodes":[{"id":"filter_1","type":"logic.filter","config":{"field":"{{trigger_1.row.email}}","operator":"not_empty","value":""}}],"edges":[{"source":"trigger_1","target":"filter_1"}],"requiredIntegrations":["google_sheets"],"explanation":"Each new row is checked for a required email field; rows missing it are flagged."}'),
('support-summary', 'Customer Support Summary', 'Summarize an incoming support message and prepare a report for the team.', 'Support', 'simple', '{"name":"Customer Support Summary","description":"Summarize incoming support messages for the team.","trigger":{"id":"trigger_1","type":"manual.trigger","config":{"sampleInput":{"message":"Customer reports login issues since yesterday."}}},"nodes":[{"id":"ai_1","type":"ai.summarize","config":{"source":"{{trigger_1.message}}","style":"paragraph","maxLength":120,"outputVariable":"summary"}}],"edges":[{"source":"trigger_1","target":"ai_1"}],"requiredIntegrations":[],"explanation":"An incoming support message is condensed into a short paragraph for the team."}'),
('text-extraction', 'AI Text Extraction', 'Extract user-defined fields from any text into structured output.', 'AI', 'simple', '{"name":"AI Text Extraction","description":"Extract structured fields from provided text.","trigger":{"id":"trigger_1","type":"manual.trigger","config":{"sampleInput":{"text":"Invoice #INV-1029 from Acme Ltd, amount $240.00, due May 12."}}},"nodes":[{"id":"ai_1","type":"ai.extract","config":{"source":"{{trigger_1.text}}","fields":["invoice_number","vendor","amount","due_date"]}}],"edges":[{"source":"trigger_1","target":"ai_1"}],"requiredIntegrations":[],"explanation":"Provided text is analyzed and the requested fields are returned as structured data."}');
