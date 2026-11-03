import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { all, get, parseJson } from "../db";
import { sha256 } from "../lib/crypto";
import { defaultUserSettings, type AuthUser, type AuthWorkspace, type UserSettings } from "../types";

interface UserRow {
  id: string;
  name: string;
  email: string;
  avatar_color: string;
  settings_json: string;
  is_demo: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  plan: string;
  is_demo: number;
  role: string;
}

export function userFromRow(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarColor: row.avatar_color,
    isDemo: Boolean(row.is_demo),
    settings: { ...defaultUserSettings, ...parseJson<Partial<UserSettings>>(row.settings_json, {}) },
    createdAt: row.created_at,
  };
}

export function workspaceFromRow(row: WorkspaceRow): AuthWorkspace {
  return {
    id: row.id,
    name: row.name,
    plan: (row.plan as AuthWorkspace["plan"]) || "free",
    isDemo: Boolean(row.is_demo),
    role: row.role,
  };
}

export function userWorkspaces(userId: string): AuthWorkspace[] {
  const rows = all<WorkspaceRow>(
    `SELECT w.id, w.name, w.plan, w.is_demo, m.role
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY w.created_at ASC`,
    userId,
  );
  return rows.map(workspaceFromRow);
}

export function resolveWorkspace(user: AuthUser): AuthWorkspace | null {
  const workspaces = userWorkspaces(user.id);
  if (workspaces.length === 0) return null;
  const activeId = user.settings.activeWorkspaceId;
  return workspaces.find((w) => w.id === activeId) ?? workspaces[0];
}

/** Loads the session if present. Never rejects — requireAuth does that. */
export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[config.sessionCookie];
  if (!token) {
    next();
    return;
  }
  const session = get<SessionRow>(
    "SELECT id, user_id, expires_at FROM sessions WHERE id = ?",
    sha256(String(token)),
  );
  if (!session || session.expires_at <= new Date().toISOString()) {
    if (session) get("DELETE FROM sessions WHERE id = ?", session.id);
    next();
    return;
  }
  const userRow = get<UserRow>(
    "SELECT id, name, email, avatar_color, settings_json, is_demo, created_at FROM users WHERE id = ?",
    session.user_id,
  );
  if (!userRow) {
    next();
    return;
  }
  const user = userFromRow(userRow);
  const workspace = resolveWorkspace(user);
  if (!workspace) {
    next();
    return;
  }
  req.auth = { user, workspace, sessionId: session.id };
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: { code: "unauthorized", message: "Please sign in to continue." } });
    return;
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: { code: "unauthorized", message: "Please sign in to continue." } });
    return;
  }
  if (req.auth.workspace.role !== "owner" && req.auth.workspace.role !== "admin") {
    res.status(403).json({ error: { code: "forbidden", message: "Only the workspace owner can do that." } });
    return;
  }
  next();
}

/** Used by OAuth callbacks where the session cookie is present but we also need state checks. */
export function sessionUser(req: Request): AuthUser | null {
  return req.auth?.user ?? null;
}
