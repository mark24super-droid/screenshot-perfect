import { all, get, nowIso, parseJson, run, transaction } from "../db";
import { config } from "../config";
import { workflowDefinitionSchema } from "@shared/workflow";
import { isTriggerType } from "@shared/nodes";
import { enqueueExecution } from "./queue";
import { getUsage } from "../services/usage";

interface ScheduleWorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  metadata_json: string;
  definition_json: string;
  is_demo: number;
}

export function nextOccurrence(configValue: Record<string, unknown>, after: Date): Date {
  const frequency = String(configValue.frequency || "daily");
  const time = String(configValue.time || "09:00");
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Math.min(23, Math.max(0, Number(hourRaw) || 0));
  const minute = Math.min(59, Math.max(0, Number(minuteRaw) || 0));
  const next = new Date(after.getTime());
  next.setUTCSeconds(0, 0);

  if (frequency === "hourly") {
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  if (frequency === "weekly") {
    const targetDay = Math.min(6, Math.max(0, Number(configValue.dayOfWeek ?? 1)));
    next.setUTCHours(hour, minute, 0, 0);
    let diff = (targetDay - next.getUTCDay() + 7) % 7;
    if (diff === 0 && next <= after) diff = 7;
    next.setUTCDate(next.getUTCDate() + diff);
    return next;
  }
  next.setUTCHours(hour, minute, 0, 0);
  if (next <= after) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function runSchedulerTick(): number {
  const rows = all<ScheduleWorkflowRow>(
    `SELECT w.id, w.workspace_id, w.name, w.metadata_json, wv.definition_json, ws.is_demo
       FROM workflows w
       JOIN workflow_versions wv ON wv.id = w.active_version_id
       JOIN workspaces ws ON ws.id = w.workspace_id
      WHERE w.status = 'active'`,
  );
  let enqueued = 0;
  const now = new Date();

  for (const row of rows) {
    const parsed = workflowDefinitionSchema.safeParse(parseJson(row.definition_json, null));
    if (!parsed.success) continue;
    const trigger = parsed.data.nodes.find((n) => isTriggerType(n.type));
    if (!trigger || trigger.type !== "schedule.trigger") continue;

    const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
    const anchorRaw = typeof metadata.scheduleAnchor === "string" ? metadata.scheduleAnchor : null;
    const anchor = anchorRaw ? new Date(anchorRaw) : new Date(now.getTime() - 60_000);
    if (Number.isNaN(anchor.getTime())) continue;

    const next = nextOccurrence(trigger.config, anchor);
    if (next > now) continue;

    const usage = getUsage(row.workspace_id);
    if (usage.executions.used >= usage.executions.limit) continue;

    const mode = metadata.runMode === "live" ? "live" : "simulation";
    const executionId = `exe_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

    transaction(() => {
      const current = get<{ metadata_json: string }>("SELECT metadata_json FROM workflows WHERE id = ?", row.id);
      const currentMeta = parseJson<Record<string, unknown>>(current?.metadata_json, {});
      // Another tick may have already scheduled this occurrence.
      if (typeof currentMeta.scheduleAnchor === "string" && new Date(currentMeta.scheduleAnchor).getTime() >= anchor.getTime() + 1000) {
        return;
      }
      run(
        `INSERT INTO executions (id, workspace_id, workflow_id, workflow_version_id, status, mode, trigger_source, started_at, is_demo, input_json, created_at)
         VALUES (?, ?, ?, ?, 'queued', ?, 'schedule', ?, ?, NULL, ?)`,
        executionId,
        row.workspace_id,
        row.id,
        get<{ active_version_id: string }>("SELECT active_version_id FROM workflows WHERE id = ?", row.id)?.active_version_id ?? null,
        mode,
        nowIso(),
        row.is_demo,
        nowIso(),
      );
      enqueueExecution(executionId);
      run(
        "UPDATE workflows SET metadata_json = ?, updated_at = ? WHERE id = ?",
        JSON.stringify({ ...currentMeta, scheduleAnchor: now.toISOString() }),
        nowIso(),
        row.id,
      );
      enqueued += 1;
    });
  }
  return enqueued;
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      const count = runSchedulerTick();
      if (count > 0) {
        console.log(JSON.stringify({ level: "info", scope: "scheduler", message: `Enqueued ${count} scheduled execution(s)` }));
      }
    } catch (error) {
      console.error(JSON.stringify({ level: "error", scope: "scheduler", message: error instanceof Error ? error.message : String(error) }));
    }
  }, config.queue.schedulerMs);
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
