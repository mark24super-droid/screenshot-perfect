import { Router } from "express";
import { z } from "zod";
import { config, isAiConfigured } from "../config";
import { get, newId, nowIso, run } from "../db";
import { asyncHandler, fail, ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { userWorkspaces } from "../middleware/auth";
import { PLAN_LIST, planById } from "@shared/plans";
import { getUsage } from "../services/usage";
import { googleOauthConfigured } from "../services/google";
import { defaultUserSettings, type UserSettings } from "../types";

export const settingsRouter = Router();

function settingsPayload(userId: string, workspaceId: string) {
  const userRow = get<{
    id: string;
    name: string;
    email: string;
    avatar_color: string;
    settings_json: string;
    is_demo: number;
  }>("SELECT id, name, email, avatar_color, settings_json, is_demo FROM users WHERE id = ?", userId);
  const workspaceRow = get<{ id: string; name: string; plan: string; is_demo: number }>(
    "SELECT id, name, plan, is_demo FROM workspaces WHERE id = ?",
    workspaceId,
  );
  const settings = {
    ...defaultUserSettings,
    ...JSON.parse(userRow?.settings_json || "{}"),
  } as UserSettings;
  return {
    user: {
      id: userRow?.id,
      name: userRow?.name,
      email: userRow?.email,
      avatarColor: userRow?.avatar_color,
      isDemo: Boolean(userRow?.is_demo),
    },
    workspace: {
      id: workspaceRow?.id,
      name: workspaceRow?.name,
      plan: workspaceRow?.plan,
      isDemo: Boolean(workspaceRow?.is_demo),
    },
    settings,
    workspaces: userWorkspaces(userId),
    usage: getUsage(workspaceId),
    flags: {
      aiProviderConfigured: isAiConfigured(),
      googleOAuthConfigured: googleOauthConfigured(),
      tokenEncryptionConfigured: Boolean(config.tokenEncryptionKey),
      billingConfigured: false,
      emailDeliveryConfigured: false,
      demoLoginEnabled: config.demo.enabled,
    },
  };
}

settingsRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    ok(res, settingsPayload(req.auth!.user.id, req.auth!.workspace.id));
  }),
);

const patchSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  defaultExecutionMode: z.enum(["simulation", "live"]).optional(),
  emailNotifications: z.boolean().optional(),
  executionNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  saveBehavior: z.enum(["autosave", "manual"]).optional(),
  workspaceName: z.string().trim().min(2, "Enter a workspace name.").max(100).optional(),
});

settingsRouter.patch(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const body = patchSchema.parse(req.body ?? {});
    const { user, workspace } = req.auth!;
    const settings: UserSettings = {
      ...user.settings,
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.defaultExecutionMode !== undefined ? { defaultExecutionMode: body.defaultExecutionMode } : {}),
      ...(body.emailNotifications !== undefined ? { emailNotifications: body.emailNotifications } : {}),
      ...(body.executionNotifications !== undefined ? { executionNotifications: body.executionNotifications } : {}),
      ...(body.weeklyDigest !== undefined ? { weeklyDigest: body.weeklyDigest } : {}),
      ...(body.saveBehavior !== undefined ? { saveBehavior: body.saveBehavior } : {}),
    };
    run(
      "UPDATE users SET name = ?, settings_json = ?, updated_at = ? WHERE id = ?",
      body.name ?? user.name,
      JSON.stringify(settings),
      nowIso(),
      user.id,
    );
    if (body.workspaceName !== undefined) {
      if (workspace.role !== "owner" && workspace.role !== "admin") {
        fail(res, 403, "forbidden", "Only the workspace owner can rename the workspace.");
        return;
      }
      run("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?", body.workspaceName, nowIso(), workspace.id);
    }
    ok(res, settingsPayload(user.id, workspace.id));
  }),
);

settingsRouter.post(
  "/delete-request",
  requireAuth,
  asyncHandler((req, res) => {
    const body = z.object({ confirm: z.literal(true), reason: z.string().max(500).optional() }).parse(req.body ?? {});
    const { user } = req.auth!;
    if (user.isDemo) {
      fail(res, 403, "demo_account", "The shared demo account cannot be deleted. Sign out to leave the demo.");
      return;
    }
    run(
      "INSERT INTO account_deletion_requests (id, user_id, reason, status, created_at) VALUES (?, ?, ?, 'requested', ?)",
      newId("del"),
      user.id,
      body.reason?.slice(0, 500) ?? null,
      nowIso(),
    );
    ok(res, {
      success: true,
      message:
        "Deletion request recorded. This deployment processes account deletion manually — your account and data have not been deleted yet.",
    });
  }),
);

export const usageRouter = Router();

usageRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    ok(res, getUsage(req.auth!.workspace.id));
  }),
);

export const billingRouter = Router();

billingRouter.get(
  "/plans",
  requireAuth,
  asyncHandler((req, res) => {
    const usage = getUsage(req.auth!.workspace.id);
    ok(res, {
      plans: PLAN_LIST,
      currentPlan: usage.plan.id,
      usage,
      billingConfigured: false,
      message: "Billing and payments are not configured on this deployment. Plan limits below are enforced, but no payment can be taken.",
    });
  }),
);

billingRouter.post(
  "/change-plan",
  requireAuth,
  asyncHandler((req, res) => {
    const body = z.object({ plan: z.enum(["free", "pro", "business"]) }).parse(req.body ?? {});
    const { workspace } = req.auth!;
    if (workspace.role !== "owner" && workspace.role !== "admin") {
      fail(res, 403, "forbidden", "Only the workspace owner can change the plan.");
      return;
    }
    if (!config.demo.enabled && config.isProduction) {
      fail(
        res,
        503,
        "billing_not_configured",
        "Payments are not configured on this deployment. Plan changes are disabled in production until a payment provider is connected.",
      );
      return;
    }
    run("UPDATE workspaces SET plan = ?, updated_at = ? WHERE id = ?", body.plan, nowIso(), workspace.id);
    ok(res, {
      success: true,
      plan: planById(body.plan),
      usage: getUsage(workspace.id),
      evaluationOnly: true,
      message: `Plan set to ${planById(body.plan).name} for evaluation. No payment was processed and no subscription was purchased.`,
    });
  }),
);
