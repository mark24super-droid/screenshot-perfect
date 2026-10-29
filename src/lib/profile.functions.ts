import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ProfileView {
  email: string;
  profile: {
    displayName: string;
    workspaceName: string;
    timezone: string;
    defaultTestMode: "simulation" | "live";
    notifyExecutionFailures: boolean;
    notifyWeeklySummary: boolean;
    onboardingCompleted: boolean;
    planId: string;
  };
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileView> => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.auth.getUser(),
    ]);
    return {
      email: authUser?.user?.email ?? "",
      profile: {
        displayName: profile?.display_name ?? "",
        workspaceName: profile?.workspace_name ?? "My Workspace",
        timezone: profile?.timezone ?? "UTC",
        defaultTestMode: (profile?.default_test_mode as "simulation" | "live") ?? "simulation",
        notifyExecutionFailures: profile?.notify_execution_failures ?? true,
        notifyWeeklySummary: profile?.notify_weekly_summary ?? false,
        onboardingCompleted: profile?.onboarding_completed ?? false,
        planId: "free",
      },
    };
  });

const updateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  workspaceName: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().max(64).optional(),
  defaultTestMode: z.enum(["simulation", "live"]).optional(),
  notifyExecutionFailures: z.boolean().optional(),
  notifyWeeklySummary: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.workspaceName !== undefined) patch.workspace_name = data.workspaceName;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (data.defaultTestMode !== undefined) patch.default_test_mode = data.defaultTestMode;
    if (data.notifyExecutionFailures !== undefined) patch.notify_execution_failures = data.notifyExecutionFailures;
    if (data.notifyWeeklySummary !== undefined) patch.notify_weekly_summary = data.notifyWeeklySummary;
    if (data.onboardingCompleted !== undefined) patch.onboarding_completed = data.onboardingCompleted;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyWorkspaceName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ workspace_name: data.name, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (pErr) throw new Error(pErr.message);
    const { error: wErr } = await supabase
      .from("workspaces")
      .update({ name: data.name })
      .eq("owner_id", userId);
    if (wErr) throw new Error(wErr.message);
    return { ok: true };
  });
