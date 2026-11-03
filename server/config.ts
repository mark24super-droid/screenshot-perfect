import path from "node:path";
import fs from "node:fs";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

const port = Number(process.env.PORT || 8790);
const appUrl = process.env.APP_URL || "http://localhost:5173";

export const config = {
  port,
  appUrl,
  apiPublicUrl: process.env.API_PUBLIC_URL || `http://localhost:${port}`,
  isProduction: process.env.NODE_ENV === "production",
  dbPath: process.env.DATABASE_PATH || path.join(process.cwd(), "data", "flowmate.db"),
  sessionCookie: "fm_session",
  sessionTtlDays: 30,
  demo: {
    enabled: bool(process.env.DEMO_LOGIN_ENABLED, true),
    email: process.env.DEMO_EMAIL || "demo@flowmate.ai",
    password: process.env.DEMO_PASSWORD || "demo1234",
    name: process.env.DEMO_NAME || "Demo User",
  },
  ai: {
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gpt-4o-mini",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
    demoFallback: bool(process.env.AI_DEMO_FALLBACK, true),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.API_PUBLIC_URL || `http://localhost:${port}`}/api/integrations/google/callback`,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  },
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || "",
  queue: {
    pollMs: Number(process.env.QUEUE_POLL_MS || 1200),
    schedulerMs: Number(process.env.SCHEDULER_POLL_MS || 30000),
  },
};

export const isAiConfigured = () => Boolean(config.ai.apiKey);
export const isGoogleConfigured = () => Boolean(config.google.clientId && config.google.clientSecret);

export function ensureDataDir(): void {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
