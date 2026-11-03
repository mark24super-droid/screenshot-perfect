import * as React from "react";
import { apiGet, apiPost } from "../lib/api";
import type { AuthResponse, AuthFlags, User, Workspace } from "../lib/types";

const DEFAULT_FLAGS: AuthFlags = {
  demoLoginEnabled: false,
  aiProviderConfigured: false,
  googleOAuthConfigured: false,
  tokenEncryptionConfigured: false,
  demoMode: false,
};

interface AuthContextValue {
  loading: boolean;
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  flags: AuthFlags;
  login: (email: string, password: string) => Promise<AuthResponse>;
  signup: (input: { name: string; email: string; password: string; workspaceName?: string }) => Promise<AuthResponse>;
  demoLogin: () => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  setAuth: (auth: AuthResponse) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = React.useState<AuthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const response = await apiGet<AuthResponse>("/auth/me");
      setAuthState(response);
    } catch {
      setAuthState(null);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    apiGet<AuthResponse>("/auth/me")
      .then((response) => {
        if (!cancelled) setAuthState(response);
      })
      .catch(() => {
        if (!cancelled) setAuthState(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAuth = React.useCallback((response: AuthResponse) => {
    setAuthState(response);
    setLoading(false);
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const response = await apiPost<AuthResponse>("/auth/login", { email, password });
      setAuth(response);
      return response;
    },
    [setAuth],
  );

  const signup = React.useCallback(
    async (input: { name: string; email: string; password: string; workspaceName?: string }) => {
      const response = await apiPost<AuthResponse>("/auth/signup", input);
      setAuth(response);
      return response;
    },
    [setAuth],
  );

  const demoLogin = React.useCallback(async () => {
    const response = await apiPost<AuthResponse>("/auth/demo");
    setAuth(response);
    return response;
  }, [setAuth]);

  const logout = React.useCallback(async () => {
    try {
      await apiPost("/auth/logout");
    } finally {
      setAuthState(null);
    }
  }, []);

  const selectWorkspace = React.useCallback(
    async (id: string) => {
      await apiPost(`/workspaces/${id}/select`);
      const response = await apiGet<AuthResponse>("/auth/me");
      setAuth(response);
    },
    [setAuth],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      loading,
      user: auth?.user ?? null,
      workspace: auth?.workspace ?? null,
      workspaces: auth?.workspaces ?? [],
      flags: auth?.flags ?? DEFAULT_FLAGS,
      login,
      signup,
      demoLogin,
      logout,
      refresh,
      selectWorkspace,
      setAuth,
    }),
    [loading, auth, login, signup, demoLogin, logout, refresh, selectWorkspace, setAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
