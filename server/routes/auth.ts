import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { config, isAiConfigured } from "../config";
import { all, get, newId, nowIso, run } from "../db";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { asyncHandler, fail, HttpError, ok } from "../lib/http";
import { clientKey, rateLimit } from "../lib/rate-limit";
import { createSession, clearSession, getUserRowByEmail } from "../lib/session";
import { attachSession, requireAuth, userFromRow, userWorkspaces } from "../middleware/auth";
import { defaultUserSettings, type UserSettings } from "../types";
import { ensureDemoUser } from "../seed";
import { googleOauthConfigured } from "../services/google";

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  workspaceName: z.string().trim().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
});

const PALETTE = ["#635BEB", "#4387E8", "#20A36A", "#E7A33E", "#D95364", "#8B5CF6"];

function pickColor(email: string): string {
  let sum = 0;
  for (const char of email) sum += char.charCodeAt(0);
  return PALETTE[sum % PALETTE.length];
}

function authPayload(userId: string) {
  const row = get<{
    id: string;
    name: string;
    email: string;
    avatar_color: string;
    settings_json: string;
    is_demo: number;
    created_at: string;
  }>("SELECT id, name, email, avatar_color, settings_json, is_demo, created_at FROM users WHERE id = ?", userId);
  if (!row) throw new HttpError(401, "unauthorized", "Session user no longer exists.");
  const user = userFromRow(row);
  const workspaces = userWorkspaces(user.id);
  const workspace = workspaces.find((w) => w.id === user.settings.activeWorkspaceId) ?? workspaces[0] ?? null;
  return {
    user,
    workspace,
    workspaces,
    flags: {
      demoLoginEnabled: config.demo.enabled,
      aiProviderConfigured: isAiConfigured(),
      googleOAuthConfigured: googleOauthConfigured(),
      tokenEncryptionConfigured: Boolean(config.tokenEncryptionKey),
      demoMode: Boolean(workspace?.isDemo),
    },
  };
}

function rateLimitOrFail(req: Request, res: Response, suffix: string, limit: number, windowMs: number): boolean {
  const result = rateLimit(clientKey(req, suffix), limit, windowMs);
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfter));
    fail(res, 429, "rate_limited", "Too many attempts. Please wait a moment and try again.");
    return false;
  }
  return true;
}

authRouter.post(
  "/signup",
  asyncHandler((req, res) => {
    if (!rateLimitOrFail(req, res, "signup", 8, 60_000)) return;
    const body = signupSchema.parse(req.body);
    const email = body.email.toLowerCase();
    if (getUserRowByEmail(email)) {
      fail(res, 409, "email_taken", "An account with this email already exists. Try signing in instead.");
      return;
    }
    const now = nowIso();
    const userId = newId("usr");
    const workspaceId = newId("ws");
    const settings: UserSettings = {
      ...defaultUserSettings,
      onboardingCompleted: false,
      activeWorkspaceId: workspaceId,
    };
    run(
      "INSERT INTO users (id, name, email, password_hash, avatar_color, settings_json, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
      userId,
      body.name,
      email,
      hashPassword(body.password),
      pickColor(email),
      JSON.stringify(settings),
      now,
      now,
    );
    run(
      "INSERT INTO workspaces (id, name, owner_id, plan, is_demo, settings_json, created_at, updated_at) VALUES (?, ?, ?, 'free', 0, '{}', ?, ?)",
      workspaceId,
      (body.workspaceName?.trim() || `${body.name.split(" ")[0]}'s workspace`).slice(0, 100),
      userId,
      now,
      now,
    );
    run(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
      newId("mem"),
      workspaceId,
      userId,
      now,
    );
    createSession(req, res, userId);
    ok(res, authPayload(userId), 201);
  }),
);

authRouter.post(
  "/login",
  asyncHandler((req, res) => {
    if (!rateLimitOrFail(req, res, "login", 10, 60_000)) return;
    const body = loginSchema.parse(req.body);
    const row = getUserRowByEmail(body.email);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      fail(res, 401, "invalid_credentials", "Email or password is incorrect.");
      return;
    }
    createSession(req, res, row.id);
    ok(res, authPayload(row.id));
  }),
);

authRouter.post(
  "/demo",
  asyncHandler((req, res) => {
    if (!config.demo.enabled) {
      fail(res, 403, "demo_disabled", "Demo login is disabled on this server.");
      return;
    }
    if (!rateLimitOrFail(req, res, "demo", 20, 60_000)) return;
    ensureDemoUser();
    const row = getUserRowByEmail(config.demo.email);
    if (!row) {
      fail(res, 500, "demo_unavailable", "The demo workspace could not be prepared. Please try again.");
      return;
    }
    createSession(req, res, row.id);
    ok(res, authPayload(row.id));
  }),
);

authRouter.post(
  "/logout",
  asyncHandler((req, res) => {
    clearSession(req, res);
    ok(res, { success: true });
  }),
);

authRouter.get(
  "/me",
  attachSession,
  requireAuth,
  asyncHandler((req, res) => {
    ok(res, authPayload(req.auth!.user.id));
  }),
);

authRouter.post(
  "/onboarding",
  attachSession,
  requireAuth,
  asyncHandler((req, res) => {
    const body = z
      .object({
        workspaceName: z.string().trim().min(2).max(100),
        timezone: z.string().trim().min(1).max(64),
        defaultExecutionMode: z.enum(["simulation", "live"]),
      })
      .parse(req.body);
    const { user, workspace } = req.auth!;
    const settings: UserSettings = {
      ...user.settings,
      timezone: body.timezone,
      defaultExecutionMode: body.defaultExecutionMode,
      onboardingCompleted: true,
    };
    run("UPDATE users SET settings_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(settings), nowIso(), user.id);
    if (workspace.role === "owner") {
      run("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?", body.workspaceName, nowIso(), workspace.id);
    }
    ok(res, authPayload(user.id));
  }),
);

authRouter.get(
  "/sessions",
  attachSession,
  requireAuth,
  asyncHandler((req, res) => {
    const rows = all<{ id: string; created_at: string; expires_at: string; user_agent: string | null }>(
      "SELECT id, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
      req.auth!.user.id,
    );
    ok(res, {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        userAgent: row.user_agent || "Unknown device",
        current: row.id === req.auth!.sessionId,
      })),
    });
  }),
);

authRouter.delete(
  "/sessions/:id",
  attachSession,
  requireAuth,
  asyncHandler((req, res) => {
    const session = get<{ id: string; user_id: string }>("SELECT id, user_id FROM sessions WHERE id = ?", req.params.id);
    if (!session || session.user_id !== req.auth!.user.id) {
      fail(res, 404, "session_not_found", "Session not found.");
      return;
    }
    run("DELETE FROM sessions WHERE id = ?", session.id);
    const wasCurrent = session.id === req.auth!.sessionId;
    if (wasCurrent) res.clearCookie(config.sessionCookie, { path: "/" });
    ok(res, { success: true, wasCurrent });
  }),
);

authRouter.post(
  "/change-password",
  attachSession,
  requireAuth,
  asyncHandler((req, res) => {
    const body = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(8, "Use at least 8 characters.").max(200),
      })
      .parse(req.body);
    if (req.auth!.user.isDemo) {
      fail(res, 403, "demo_account", "The shared demo account password cannot be changed.");
      return;
    }
    const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", req.auth!.user.id);
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) {
      fail(res, 400, "invalid_password", "Your current password is incorrect.");
      return;
    }
    run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", hashPassword(body.newPassword), nowIso(), req.auth!.user.id);
    run("DELETE FROM sessions WHERE user_id = ? AND id != ?", req.auth!.user.id, req.auth!.sessionId);
    ok(res, { success: true });
  }),
);

authRouter.get(
  "/bootstrap",
  asyncHandler((_req, res) => {
    ok(res, {
      demoLoginEnabled: config.demo.enabled,
      demoEmail: config.demo.enabled ? config.demo.email : null,
      aiProviderConfigured: isAiConfigured(),
      googleOAuthConfigured: googleOauthConfigured(),
      tokenEncryptionConfigured: Boolean(config.tokenEncryptionKey),
    });
  }),
);
