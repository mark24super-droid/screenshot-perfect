import type { PlanDefinition, UsageSnapshot } from "@shared/plans";
import type { IntegrationStatus, ValidationResult, WorkflowDefinition } from "@shared/workflow";
import type { ProviderId } from "@shared/nodes";

export interface UserSettings {
  timezone: string;
  defaultExecutionMode: "simulation" | "live";
  emailNotifications: boolean;
  executionNotifications: boolean;
  weeklyDigest: boolean;
  saveBehavior: "autosave" | "manual";
  onboardingCompleted: boolean;
  activeWorkspaceId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  isDemo: boolean;
  settings: UserSettings;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: "free" | "pro" | "business";
  isDemo: boolean;
  role: string;
  workflowCount?: number;
  active?: boolean;
}

export interface AuthFlags {
  demoLoginEnabled: boolean;
  aiProviderConfigured: boolean;
  googleOAuthConfigured: boolean;
  tokenEncryptionConfigured: boolean;
  demoMode: boolean;
}

export interface AuthResponse {
  user: User;
  workspace: Workspace | null;
  workspaces: Workspace[];
  flags: AuthFlags;
}

export type WorkflowStatus = "draft" | "needs_configuration" | "active" | "paused" | "error";

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  triggerType: string | null;
  triggerLabel: string;
  integrations: ProviderId[];
  nodeCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  updatedAt: string;
  createdAt: string;
  successRate: number | null;
  runCount: number;
  failedCount: number;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  triggerType: string | null;
  triggerLabel: string;
  definition: WorkflowDefinition | null;
  version: number;
  versionId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  metadata: Record<string, unknown>;
  runMode: "simulation" | "live";
  connections: Record<"gmail" | "google_sheets", IntegrationStatus>;
  validation: ValidationResult | null;
  liveValidation: ValidationResult | null;
  requiredIntegrations: ProviderId[];
  stats: { total: number; succeeded: number; failed: number };
  save?: { statusNote: string | null; definitionChanged: boolean; version: number };
}

export interface ConnectionSummary {
  provider: ProviderId | "gmail" | "google_sheets";
  status: IntegrationStatus;
  accountLabel: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastCheckedAt: string | null;
  oauthConfigured: boolean;
  hasRefreshToken: boolean;
  encryptionConfigured: boolean;
}

export interface IntegrationProvider extends ConnectionSummary {
  name: string;
  description: string;
  capabilities: string[];
  notes: string;
  requiredScopes: string[];
  setupRequired: boolean;
}

export interface IntegrationsResponse {
  providers: IntegrationProvider[];
  ai: {
    configured: boolean;
    model: string | null;
    baseUrl: string | null;
    demoPlannerEnabled: boolean;
    status: string;
    description: string;
    note: string;
  };
  oauthConfigured: boolean;
  tokenEncryptionConfigured: boolean;
}

export interface ExecutionListItem {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  mode: "simulation" | "live";
  triggerSource: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorSummary: string | null;
  isDemo: boolean;
  succeededSteps: number;
  failedSteps: number;
  totalSteps: number;
}

export interface ExecutionStep {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeTitle: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  attempt: number;
  seq: number;
}

export interface ExecutionDetail extends ExecutionListItem {
  workflowStatus: string;
  workflowVersionId: string | null;
  input: Record<string, unknown> | null;
  steps: ExecutionStep[];
  canRetry: boolean;
  retryReason: string | null;
}

export interface ExecutionListResponse {
  items: ExecutionListItem[];
  total: number;
  limit: number;
  offset: number;
  historyDays: number;
  historyStart: string;
}

export interface DashboardSummary {
  stats: {
    totalAutomations: number;
    activeAutomations: number;
    executionsThisMonth: number;
    failedExecutions: number;
  };
  recentAutomations: WorkflowListItem[];
  recentActivity: ExecutionListItem[];
  integrations: ConnectionSummary[];
  usage: UsageSnapshot;
  demoMode: boolean;
  aiProviderConfigured: boolean;
  onboardingCompleted: boolean;
  pendingApproval: Array<{ id: string; name: string }>;
}

export interface TemplateItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  complexity: "Easy" | "Medium";
  demoOnly: boolean;
  integrations: ProviderId[];
  highlights: string[];
  definition: WorkflowDefinition;
}

export interface GeneratePlan {
  name: string;
  description: string;
  explanation: string;
  definition: WorkflowDefinition;
  requiredIntegrations: ProviderId[];
  missingConfiguration: string[];
  source: "provider" | "local-demo";
  providerConfigured: boolean;
  model: string | null;
  notes: string[];
}

export interface GenerateResponse {
  plan: GeneratePlan;
  mode: "ai" | "demo-generator";
  message: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string;
  current: boolean;
}

export interface SettingsPayload {
  user: { id: string; name: string; email: string; avatarColor: string; isDemo: boolean };
  workspace: { id: string; name: string; plan: string; isDemo: boolean };
  settings: UserSettings;
  workspaces: Workspace[];
  usage: UsageSnapshot;
  flags: {
    aiProviderConfigured: boolean;
    googleOAuthConfigured: boolean;
    tokenEncryptionConfigured: boolean;
    billingConfigured: boolean;
    emailDeliveryConfigured: boolean;
    demoLoginEnabled: boolean;
  };
}

export interface BillingPlansResponse {
  plans: PlanDefinition[];
  currentPlan: string;
  usage: UsageSnapshot;
  billingConfigured: boolean;
  message: string;
}
