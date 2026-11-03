import type { PlanId } from "@shared/plans";

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

export const defaultUserSettings: UserSettings = {
  timezone: "UTC",
  defaultExecutionMode: "simulation",
  emailNotifications: false,
  executionNotifications: true,
  weeklyDigest: false,
  saveBehavior: "autosave",
  onboardingCompleted: false,
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  isDemo: boolean;
  settings: UserSettings;
  createdAt: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  plan: PlanId;
  isDemo: boolean;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: AuthUser;
        workspace: AuthWorkspace;
        sessionId: string;
      };
    }
  }
}

export {};
