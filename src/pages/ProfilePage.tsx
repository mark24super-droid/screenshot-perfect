import * as React from "react";
import { Link } from "react-router-dom";
import { Building2, Calendar, FlaskConical, KeyRound, Laptop, LogOut, Mail, Settings, ShieldCheck, User } from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { SettingsNav } from "../components/settings/SettingsNav";
import { Badge, Card, CardBody, CardHeader, Skeleton } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Avatar, ErrorState } from "../components/ui/Misc";
import { useAuth } from "../context/AuthContext";
import { apiGet, errorMessage } from "../lib/api";
import type { SessionInfo, SettingsPayload } from "../lib/types";
import { formatDate, formatDateTime, relativeTime } from "../lib/utils";

export default function ProfilePage() {
  const { user, workspace } = useAuth();
  const [data, setData] = React.useState<SettingsPayload | null>(null);
  const [sessions, setSessions] = React.useState<SessionInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, sessionResponse] = await Promise.all([
        apiGet<SettingsPayload>("/settings"),
        apiGet<{ sessions: SessionInfo[] }>("/auth/sessions"),
      ]);
      setData(settings);
      setSessions(sessionResponse.sessions);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-7 w-40" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
          <Skeleton className="h-40 w-full" />
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <PageTitle title="Profile" />
        <ErrorState className="mt-5" description={error ?? "Profile could not be loaded."} onRetry={() => void load()} />
      </PageContainer>
    );
  }

  const currentSessions = sessions.filter((session) => session.current);

  return (
    <PageContainer>
      <PageTitle title="Profile & security" description="Your account details, workspace membership and active sessions." />
      <div className="mt-5 grid gap-5 lg:grid-cols-[210px_1fr]">
        <SettingsNav />
        <div className="space-y-5">
          <Card>
            <CardBody>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Avatar name={data.user.name} color={data.user.avatarColor} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{data.user.name}</h2>
                    {data.user.isDemo ? (
                      <Badge tone="warning">
                        <FlaskConical size={10} /> Demo account
                      </Badge>
                    ) : (
                      <Badge tone="success">Personal account</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-secondary">
                    <Mail size={12} /> {data.user.email}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-ink-secondary">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} /> {data.workspace.name}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={11} /> Joined {formatDate(user?.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={11} /> Role {workspace?.role ?? "member"}
                    </span>
                  </p>
                </div>
                <Link to="/settings">
                  <Button variant="secondary" size="sm">
                    <Settings size={13} /> Edit profile
                  </Button>
                </Link>
              </div>

              {data.user.isDemo ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
                  <strong className="font-semibold">Shared demo account.</strong> Anyone using this deployment can sign in to the same demo
                  workspace. Do not enter personal or confidential data. Create your own account for private workspaces.
                </div>
              ) : null}
            </CardBody>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <User size={14} /> Account
                </h2>
              </CardHeader>
              <CardBody>
                <dl className="space-y-2.5 text-[11.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-secondary">Display name</dt>
                    <dd className="truncate font-medium text-ink">{data.user.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-secondary">Email</dt>
                    <dd className="truncate font-medium text-ink">{data.user.email}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-secondary">Timezone</dt>
                    <dd className="font-medium text-ink">{data.settings.timezone}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-secondary">Default mode</dt>
                    <dd className="font-medium capitalize text-ink">{data.settings.defaultExecutionMode}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-secondary">Account type</dt>
                    <dd className="font-medium text-ink">{data.user.isDemo ? "Shared demo" : "Personal"}</dd>
                  </div>
                </dl>
                <Link to="/settings" className="mt-3 inline-flex text-[11px] font-medium text-primary hover:underline">
                  Manage preferences
                </Link>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <ShieldCheck size={14} /> Security
                </h2>
                <Badge tone="outline">{sessions.length} sessions</Badge>
              </CardHeader>
              <CardBody>
                <div className="flex items-start gap-2 rounded-lg border border-line bg-app/40 p-2.5">
                  <Laptop size={14} className="mt-0.5 shrink-0 text-ink-secondary" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-ink">Current session</p>
                    <p className="truncate text-[10.5px] text-ink-secondary">{currentSessions[0]?.userAgent ?? "This device"}</p>
                    <p className="text-[10px] text-ink-secondary">
                      Started {currentSessions[0] ? formatDateTime(currentSessions[0].createdAt) : "—"} · expires{" "}
                      {currentSessions[0] ? relativeTime(currentSessions[0].expiresAt) : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/settings">
                    <Button variant="secondary" size="sm">
                      <KeyRound size={12} /> Password & sessions
                    </Button>
                  </Link>
                  <Link to="/settings">
                    <Button variant="ghost" size="sm">
                      <LogOut size={12} /> Session controls
                    </Button>
                  </Link>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-secondary">
                  {data.user.isDemo
                    ? "The shared demo password cannot be changed. Revoking the current session signs you out."
                    : "Changing your password signs out every other session. Sessions are stored as hashed tokens."}
                </p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-[13px] font-semibold text-ink">Workspace access</h2>
                <p className="mt-0.5 text-[11px] text-ink-secondary">This account currently belongs to the following workspace.</p>
              </div>
            </CardHeader>
            <div className="divide-y divide-line">
              {data.workspaces.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Building2 size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-ink">{item.name}</p>
                    <p className="text-[10.5px] capitalize text-ink-secondary">
                      {item.plan} plan · role {item.role}
                    </p>
                  </div>
                  {item.isDemo ? <Badge tone="warning">Demo</Badge> : null}
                  <Link to="/settings/workspace" className="text-[10.5px] font-medium text-primary hover:underline">
                    Manage
                  </Link>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-danger/20">
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[12.5px] font-semibold text-ink">Account deletion</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">
                  Deletion is processed manually by the deployment operator. Submitting a request does not delete data immediately.
                </p>
              </div>
              <Link to="/settings">
                <Button variant="danger-outline" size="sm" disabled={data.user.isDemo}>
                  Request deletion
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
