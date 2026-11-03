import { Router } from "express";
import { z } from "zod";
import { get, newId, nowIso, run } from "../db";
import { asyncHandler, fail, ok } from "../lib/http";
import { requireAuth, userWorkspaces } from "../middleware/auth";
import type { UserSettings } from "../types";

export const workspacesRouter = Router();

workspacesRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const items = userWorkspaces(req.auth!.user.id).map((workspace) => {
      const count = get<{ c: number }>("SELECT COUNT(*) as c FROM workflows WHERE workspace_id = ?", workspace.id)?.c ?? 0;
      return { ...workspace, workflowCount: count, active: workspace.id === req.auth!.workspace.id };
    });
    ok(res, { items });
  }),
);

workspacesRouter.post(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const body = z.object({ name: z.string().trim().min(2, "Enter a workspace name.").max(100) }).parse(req.body ?? {});
    const { user } = req.auth!;
    const now = nowIso();
    const workspaceId = newId("ws");
    run(
      "INSERT INTO workspaces (id, name, owner_id, plan, is_demo, settings_json, created_at, updated_at) VALUES (?, ?, ?, 'free', 0, '{}', ?, ?)",
      workspaceId,
      body.name,
      user.id,
      now,
      now,
    );
    run(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
      newId("mem"),
      workspaceId,
      user.id,
      now,
    );
    const settings: UserSettings = { ...user.settings, activeWorkspaceId: workspaceId };
    run("UPDATE users SET settings_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(settings), now, user.id);
    ok(res, { id: workspaceId, name: body.name, plan: "free", role: "owner", isDemo: false }, 201);
  }),
);

workspacesRouter.post(
  "/:id/select",
  requireAuth,
  asyncHandler((req, res) => {
    const { user } = req.auth!;
    const membership = get<{ role: string }>(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id,
      user.id,
    );
    if (!membership) {
      fail(res, 404, "workspace_not_found", "Workspace not found.");
      return;
    }
    const workspace = get<{ id: string; name: string; plan: string; is_demo: number }>(
      "SELECT id, name, plan, is_demo FROM workspaces WHERE id = ?",
      req.params.id,
    );
    if (!workspace) {
      fail(res, 404, "workspace_not_found", "Workspace not found.");
      return;
    }
    const settings: UserSettings = { ...user.settings, activeWorkspaceId: workspace.id };
    run("UPDATE users SET settings_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(settings), nowIso(), user.id);
    ok(res, {
      id: workspace.id,
      name: workspace.name,
      plan: workspace.plan,
      isDemo: Boolean(workspace.is_demo),
      role: membership.role,
    });
  }),
);

workspacesRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler((req, res) => {
    const body = z.object({ name: z.string().trim().min(2).max(100) }).parse(req.body ?? {});
    const membership = get<{ role: string }>(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      req.params.id,
      req.auth!.user.id,
    );
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      fail(res, 403, "forbidden", "Only the workspace owner can rename this workspace.");
      return;
    }
    run("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?", body.name, nowIso(), req.params.id);
    ok(res, { id: req.params.id, name: body.name });
  }),
);
