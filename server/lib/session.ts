import type { Request, Response } from "express";
import { config } from "../config";
import { get, newId, nowIso, run } from "../db";
import { randomToken, sha256 } from "../lib/crypto";

export function createSession(req: Request, res: Response, userId: string): string {
  const token = randomToken(32);
  const id = sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlDays * 86400000);
  run(
    "INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    id,
    userId,
    now.toISOString(),
    expires.toISOString(),
    String(req.headers["user-agent"] ?? "").slice(0, 300),
  );
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    expires,
  });
  return id;
}

export function clearSession(req: Request, res: Response): void {
  if (req.auth?.sessionId) {
    run("DELETE FROM sessions WHERE id = ?", req.auth.sessionId);
  }
  res.clearCookie(config.sessionCookie, { path: "/" });
}

export function deleteSessionById(sessionId: string): void {
  run("DELETE FROM sessions WHERE id = ?", sessionId);
}

export function createWorkspaceForUser(userId: string, name: string, plan = "free"): string {
  const now = nowIso();
  const workspaceId = newId("ws");
  run(
    "INSERT INTO workspaces (id, name, owner_id, plan, is_demo, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, 0, '{}', ?, ?)",
    workspaceId,
    name.slice(0, 100),
    userId,
    plan,
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
  return workspaceId;
}

export function getUserRowByEmail(email: string) {
  return get<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    avatar_color: string;
    settings_json: string;
    is_demo: number;
    created_at: string;
  }>("SELECT id, name, email, password_hash, avatar_color, settings_json, is_demo, created_at FROM users WHERE email = ?", email.toLowerCase());
}
