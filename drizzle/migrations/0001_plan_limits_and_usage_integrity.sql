-- ============ FlowMate AI plan limits & usage integrity ============
-- Applies to: after 0000_flowmate_schema.sql
--
-- Adds database-level backstops for the plan checks enforced in application
-- code (src/lib/plans.ts, src/lib/usage.server.ts, workflow/execution/ai
-- server functions). RLS stays on everywhere; nothing is disabled.
--
-- What this fixes (audit findings S1/S2):
--   * Direct Supabase PostgREST access with the anon key + a user JWT could
--     create rows past plan limits, because limits only lived in TypeScript.
--     New INSERT policies below enforce them in the database.
--   * Usage counts lived in a user-writable usage_records table, so counts
--     could be forged. Users now hold no INSERT privilege on usage_records;
--     the trusted security-definer RPC below is the only writer.
--   * Counting fields (executions.started_at, workflows.workspace_id,
--     workspaces.plan_id) were user-updatable; they are now locked at
--     column level so monthly/count quotas cannot be reset or re-attributed.
--
-- Rollback: re-grant the revoked privileges listed in "Tamper protection"
-- and "Usage integrity" sections, drop the new policies/functions/table.
--
-- NOTE: legitimate application paths are unaffected — every write below goes
-- through the same policies the app's user-scoped client already passed; only
-- previously-unguarded direct writes gain checks.

-- ---------------------------------------------------------------- plan limits
-- Mirror of PLANS[].limits in src/lib/plans.ts (kept in sync by
-- src/test/plan-sync.test.ts). Service role maintains this table.
create table public.plan_limits (
  plan_id text primary key check (plan_id in ('free', 'pro', 'business')),
  workflows integer not null check (workflows >= 1),
  monthly_executions integer not null check (monthly_executions >= 1),
  ai_generations integer not null check (ai_generations >= 1)
);
insert into public.plan_limits (plan_id, workflows, monthly_executions, ai_generations) values
  ('free', 3, 50, 25),
  ('pro', 25, 1000, 300),
  ('business', 100, 10000, 2000);
alter table public.plan_limits enable row level security;
revoke all on public.plan_limits from anon, authenticated;
grant all on public.plan_limits to service_role;

-- Where a workspace's plan lives. Adds a column; existing rows default to the
-- active plan. No legitimate app path sets this client-side.
alter table public.workspaces add column if not exists plan_id text not null default 'free';
-- The plan is administered server-side; users cannot forge or self-upgrade it.
revoke insert (plan_id) on public.workspaces from authenticated;
revoke update (plan_id) on public.workspaces from authenticated;

-- ---------------------------------------------------------------- quota checks
create or replace function public.workspace_plan_id(_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select w.plan_id from public.workspaces w where w.id = _workspace_id),
    'free'
  )
$$;

create or replace function public.assert_workflow_quota(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_member(_workspace_id, auth.uid())
    and (select count(*) from public.workflows w where w.workspace_id = _workspace_id)
      < coalesce(
          (select l.workflows
             from public.plan_limits l
            where l.plan_id = public.workspace_plan_id(_workspace_id)),
          3)
$$;

create or replace function public.assert_execution_quota(_workflow_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with ws as (
    select workspace_id, public.workspace_plan_id(workspace_id) as plan
    from public.workflows
    where id = _workflow_id
  )
  select exists (
      select 1 from public.workflows w
      where w.id = _workflow_id
        and public.is_workspace_member(w.workspace_id, auth.uid())
    )
    and (select count(*)
           from public.executions e
           join public.workflows w on w.id = e.workflow_id
          where w.workspace_id = (select workspace_id from ws)
            and e.started_at >= date_trunc('month', now()))
        < coalesce(
            (select l.monthly_executions
               from public.plan_limits l
              where l.plan_id = (select plan from ws)),
            50)
$$;

-- ------------------------------------------------- workload insert policies
create policy "workflows count against plan" on public.workflows
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id, auth.uid())
    and public.assert_workflow_quota(workspace_id)
  );

create policy "executions count against plan" on public.executions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workflows w
      where w.id = workflow_id
        and public.is_workspace_member(w.id, auth.uid())
    )
    and public.assert_execution_quota(workflow_id)
  );

-- ------------------------------------------------------- Tamper protection
-- Legit engine/save paths only update: executions(status, finished_at,
-- duration_ms, error_summary) and workflows(name, description, status,
-- trigger_type, active_version_id). Counting/ownership columns stay frozen.
revoke update (workflow_id, workflow_version_id, started_at) on public.executions from authenticated;
revoke update (workspace_id) on public.workflows from authenticated;

-- -------------------------------------------------- usage_records integrity
-- Users keep read access for their own usage; INSERT moves to the RPC.
revoke insert on public.usage_records from authenticated;
drop policy "members record usage" on public.usage_records;

create or replace function public.record_usage(
  _workspace_id uuid,
  _usage_type text,
  _quantity integer default 1
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if _quantity < 1 or _quantity > 100 then
    raise exception 'Usage quantity out of range.';
  end if;
  if _usage_type not in ('execution', 'ai_generation') then
    raise exception 'Unknown usage type.';
  end if;
  if not public.is_workspace_member(_workspace_id, auth.uid()) then
    raise exception 'Not a member of this workspace.';
  end if;
  insert into public.usage_records (workspace_id, usage_type, quantity)
    values (_workspace_id, _usage_type, _quantity);
end;
$$;
grant execute on function public.record_usage(uuid, text, integer) to authenticated;

-- ------------------------------------------------- one workspace per account
-- Workspaces are created only by the signup trigger; a user should not mint
-- extra ones (each would carry its own plan quota).
drop policy "owners manage workspaces" on public.workspaces;
create policy "owners view workspaces" on public.workspaces
  for select to authenticated using (owner_id = auth.uid());
create policy "one workspace per owner" on public.workspaces
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (select count(*) from public.workspaces w where w.owner_id = auth.uid()) = 0
  );
create policy "owners update workspaces" on public.workspaces
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete own workspace" on public.workspaces
  for delete to authenticated using (owner_id = auth.uid());
