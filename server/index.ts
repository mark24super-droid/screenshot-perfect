import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { config, isAiConfigured, isGoogleConfigured } from "./config";
import { db, nowIso, run } from "./db";
import { attachSession } from "./middleware/auth";
import { originCheck, securityHeaders } from "./middleware/security";
import { errorHandler, fail } from "./lib/http";
import { seedDatabase } from "./seed";
import { startQueue, stopQueue } from "./engine/queue";
import { startScheduler, stopScheduler } from "./engine/scheduler";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { workflowsRouter } from "./routes/workflows";
import { executionsRouter } from "./routes/executions";
import { templatesRouter } from "./routes/templates";
import { integrationsRouter } from "./routes/integrations";
import { billingRouter, settingsRouter, usageRouter } from "./routes/settings";
import { workspacesRouter } from "./routes/workspaces";

seedDatabase();

const app = express();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(originCheck);
app.use(attachSession);

app.get("/api/health", (_req, res) => {
  let dbOk = false;
  try {
    db.prepare("SELECT 1 as ok").get();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({
    data: {
      status: dbOk ? "ok" : "degraded",
      database: dbOk ? "ok" : "error",
      aiConfigured: isAiConfigured(),
      googleOAuthConfigured: isGoogleConfigured(),
      demoLoginEnabled: config.demo.enabled,
      queue: "in-process SQLite-backed queue (development fallback)",
      time: nowIso(),
    },
  });
});

app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/executions", executionsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/usage", usageRouter);
app.use("/api/billing", billingRouter);
app.use("/api/workspaces", workspacesRouter);

app.use("/api", (req, res) => {
  fail(res, 404, "not_found", `No API route matches ${req.method} ${req.originalUrl}.`);
});

const clientDir = path.join(process.cwd(), "dist", "client");
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, { maxAge: "1h", index: false }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(200)
      .type("html")
      .send(
        `<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto">
        <h1>FlowMate AI API</h1>
        <p>The API is running on port ${config.port}. The client bundle has not been built yet.</p>
        <p>Run <code>npm run dev</code> for development, or <code>npm run build</code> then <code>npm start</code>.</p>
        <p><a href="/api/health">API health</a></p>
        </body></html>`,
      );
  });
}

app.use(errorHandler);

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", scope: "server", message: `FlowMate AI listening on http://localhost:${config.port}` }));
  if (!isAiConfigured()) {
    console.log(
      JSON.stringify({
        level: "warn",
        scope: "config",
        message: "No AI provider configured (AI_API_KEY). AI generation uses the local demo planner; AI steps are simulated in simulation mode.",
      }),
    );
  }
  if (!isGoogleConfigured()) {
    console.log(
      JSON.stringify({
        level: "warn",
        scope: "config",
        message: "Google OAuth is not configured. Integrations show Setup required; simulation mode is fully usable.",
      }),
    );
  }
  if (!config.tokenEncryptionKey) {
    console.log(
      JSON.stringify({
        level: "warn",
        scope: "config",
        message: "TOKEN_ENCRYPTION_KEY is not set. A development-only key is used for token encryption. Set a strong key in production.",
      }),
    );
  }
  if (config.demo.enabled) {
    console.log(
      JSON.stringify({
        level: "warn",
        scope: "config",
        message: `Development demo login is enabled (${config.demo.email}). Disable with DEMO_LOGIN_ENABLED=false in production.`,
      }),
    );
  }
  startQueue();
  startScheduler();
});

const sessionCleanup = setInterval(() => {
  run("DELETE FROM sessions WHERE expires_at <= ?", nowIso());
}, 60 * 60 * 1000);
sessionCleanup.unref?.();

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: "info", scope: "server", message: `Received ${signal}, shutting down.` }));
  stopQueue();
  stopScheduler();
  clearInterval(sessionCleanup);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ level: "error", scope: "process", message: String(reason) }));
});
