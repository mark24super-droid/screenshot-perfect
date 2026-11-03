import { get, newId, nowIso, run, transaction } from "../db";
import { config } from "../config";
import { runExecution } from "./runner";

interface JobRow {
  id: string;
  execution_id: string;
  status: string;
  attempts: number;
}

export function enqueueExecution(executionId: string, runAt = new Date()): void {
  run(
    "INSERT INTO execution_jobs (id, execution_id, status, attempts, run_at, created_at) VALUES (?, ?, 'pending', 0, ?, ?)",
    newId("job"),
    executionId,
    runAt.toISOString(),
    nowIso(),
  );
}

let processing = false;

/** Claim and run one pending job. Exported so tests and scripts can drain the queue. */
export async function processQueueOnce(): Promise<boolean> {
  if (processing) return false;
  processing = true;
  try {
    const job = get<JobRow>(
      "SELECT id, execution_id, status, attempts FROM execution_jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at ASC LIMIT 1",
      nowIso(),
    );
    if (!job) return false;

    const claimed = transaction(() => {
      const result = run(
        "UPDATE execution_jobs SET status = 'processing', attempts = attempts + 1, locked_at = ? WHERE id = ? AND status = 'pending'",
        nowIso(),
        job.id,
      );
      return Number(result.changes) === 1;
    });
    if (!claimed) return false;

    try {
      await runExecution(job.execution_id);
      run("UPDATE execution_jobs SET status = 'done', last_error = NULL WHERE id = ?", job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Unknown worker error";
      console.error(JSON.stringify({ level: "error", scope: "queue", job: job.id, message }));
      run("UPDATE execution_jobs SET status = 'failed', last_error = ? WHERE id = ?", message, job.id);
      run(
        "UPDATE executions SET status = 'failed', finished_at = ?, error_summary = ? WHERE id = ? AND status IN ('queued','running')",
        nowIso(),
        "The execution worker stopped unexpectedly. Please retry the workflow.",
        job.execution_id,
      );
    }
    return true;
  } finally {
    processing = false;
  }
}

async function drain(): Promise<void> {
  // Keep the loop bounded per tick so one burst cannot starve the event loop.
  for (let i = 0; i < 10; i++) {
    const worked = await processQueueOnce();
    if (!worked) break;
  }
}

let timer: NodeJS.Timeout | null = null;

export function recoverInterruptedJobs(): void {
  const stale = get<{ c: number }>("SELECT COUNT(*) as c FROM execution_jobs WHERE status = 'processing'");
  if ((stale?.c ?? 0) > 0) {
    run(
      `UPDATE executions SET status = 'failed', finished_at = ?, error_summary = ?
        WHERE id IN (SELECT execution_id FROM execution_jobs WHERE status = 'processing')
          AND status IN ('queued','running')`,
      nowIso(),
      "The server restarted while this execution was running. The in-process queue cannot resume partially executed workflows — please retry.",
    );
    run(
      "UPDATE execution_jobs SET status = 'failed', last_error = 'Server restarted during execution' WHERE status = 'processing'",
    );
  }
}

export function startQueue(): void {
  if (timer) return;
  recoverInterruptedJobs();
  timer = setInterval(() => {
    void drain();
  }, config.queue.pollMs);
  timer.unref?.();
  void drain();
}

export function stopQueue(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
