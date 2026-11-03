import { all, db, get, newId, nowIso, parseJson, run, transaction } from "./db";
import { hashPassword } from "./lib/crypto";
import { config } from "./config";
import { TEMPLATES } from "@shared/templates";
import type { WorkflowDefinition } from "@shared/workflow";
import { getNodeDefinition } from "@shared/nodes";
import { defaultUserSettings } from "./types";

interface SeedWorkflow {
  name: string;
  description: string;
  status: string;
  triggerType: string;
  definition: WorkflowDefinition;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function definitionOf(slug: string): WorkflowDefinition {
  const template = TEMPLATES.find((t) => t.slug === slug);
  if (!template) throw new Error(`Unknown template ${slug}`);
  return clone(template.definition);
}

function updateNode(def: WorkflowDefinition, nodeId: string, config: Record<string, unknown>): WorkflowDefinition {
  return {
    ...def,
    nodes: def.nodes.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n)),
  };
}

export function seedTemplates(): void {
  for (const template of TEMPLATES) {
    const existing = get<{ id: string }>("SELECT id FROM templates WHERE slug = ?", template.slug);
    const values = [
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.definition),
      template.demoOnly ? 1 : 0,
      template.complexity,
      nowIso(),
    ];
    if (existing) {
      run(
        "UPDATE templates SET name = ?, description = ?, category = ?, definition_json = ?, is_demo_only = ?, complexity = ? WHERE slug = ?",
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        template.slug,
      );
    } else {
      run(
        "INSERT INTO templates (id, slug, name, description, category, definition_json, is_published, is_demo_only, complexity, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
        newId("tpl"),
        template.slug,
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        values[6],
      );
    }
  }
}

export function ensureDemoUser(): void {
  const existing = get<{ id: string }>("SELECT id FROM users WHERE email = ?", config.demo.email);
  if (existing) return;

  const now = nowIso();
  const userId = newId("usr");
  const workspaceId = newId("ws");
  const passwordHash = hashPassword(config.demo.password);
  const settings = { ...defaultUserSettings, onboardingCompleted: true, activeWorkspaceId: workspaceId };

  transaction(() => {
    run(
      "INSERT INTO users (id, name, email, password_hash, avatar_color, settings_json, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
      userId,
      config.demo.name,
      config.demo.email,
      passwordHash,
      "#635BEB",
      JSON.stringify(settings),
      now,
      now,
    );
    run(
      "INSERT INTO workspaces (id, name, owner_id, plan, is_demo, settings_json, created_at, updated_at) VALUES (?, ?, ?, 'pro', 1, ?, ?, ?)",
      workspaceId,
      "Acme Studio (Demo)",
      userId,
      JSON.stringify({ demo: true }),
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
    for (const provider of ["gmail", "google_sheets"] as const) {
      run(
        `INSERT INTO integration_connections (id, workspace_id, provider, status, granted_scopes, account_label, connected_at, last_checked_at)
         VALUES (?, ?, ?, 'demo', ?, ?, ?, ?)`,
        newId("con"),
        workspaceId,
        provider,
        provider === "gmail"
          ? "gmail.readonly, gmail.send"
          : "spreadsheets",
        provider === "gmail" ? "Demo inbox (simulated)" : "Demo spreadsheet (simulated)",
        now,
        now,
      );
    }
  });
}

export function seedDemoData(): void {
  const user = get<{ id: string }>("SELECT id FROM users WHERE email = ?", config.demo.email);
  if (!user) return;
  const workspace = get<{ id: string; is_demo: number }>("SELECT id, is_demo FROM workspaces WHERE owner_id = ? LIMIT 1", user.id);
  if (!workspace) return;

  const workflowCount = get<{ c: number }>("SELECT COUNT(*) as c FROM workflows WHERE workspace_id = ?", workspace.id);
  if ((workflowCount?.c ?? 0) > 0) return;

  const invoiceDef = updateNode(definitionOf("email-to-google-sheets"), "add_invoice_row", {
    spreadsheetId: "demo_sheet_invoices",
  });
  const leadDef = updateNode(definitionOf("contact-form-follow-up"), "send_confirmation", { to: "" });
  const summaryDef = updateNode(definitionOf("daily-email-summary"), "send_report", { to: "demo@flowmate.ai" });
  const validationDef = definitionOf("spreadsheet-data-validation");
  const supportDef = definitionOf("customer-support-summary");

  const workflows: SeedWorkflow[] = [
    {
      name: "Invoice emails to Google Sheets",
      description: "Extract invoice details from new Gmail messages and append them to the Invoices sheet.",
      status: "active",
      triggerType: "gmail.new_email",
      definition: invoiceDef,
    },
    {
      name: "Lead follow-up",
      description: "Extract contact details from a form submission and send a confirmation email.",
      status: "needs_configuration",
      triggerType: "manual.trigger",
      definition: leadDef,
    },
    {
      name: "Daily inbox summary",
      description: "Read recent emails every morning, summarize them, and send a report.",
      status: "paused",
      triggerType: "schedule.trigger",
      definition: summaryDef,
    },
    {
      name: "Spreadsheet data validation",
      description: "Check new spreadsheet rows and alert when a required email is missing.",
      status: "draft",
      triggerType: "google_sheets.new_row",
      definition: validationDef,
    },
    {
      name: "Support message summary",
      description: "Turn a pasted support message into a short bullet-point summary.",
      status: "draft",
      triggerType: "manual.trigger",
      definition: supportDef,
    },
  ];

  const now = Date.now();
  const createdWorkflowIds: Array<{ id: string; versionId: string; def: WorkflowDefinition; status: string; trigger: string }> = [];

  transaction(() => {
    for (const wf of workflows) {
      const createdAt = new Date(now - 1000 * 60 * 60 * 24 * 9).toISOString();
      const workflowId = newId("wf");
      const versionId = newId("wfv");
      run(
        `INSERT INTO workflows (id, workspace_id, name, description, status, trigger_type, active_version_id, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
        workflowId,
        workspace.id,
        wf.name,
        wf.description,
        wf.status,
        wf.triggerType,
        versionId,
        createdAt,
        new Date(now - 1000 * 60 * 60 * (wf.status === "active" ? 2 : 26)).toISOString(),
      );
      run(
        "INSERT INTO workflow_versions (id, workflow_id, version, definition_json, created_at, created_by) VALUES (?, ?, 1, ?, ?, ?)",
        versionId,
        workflowId,
        JSON.stringify(wf.definition),
        createdAt,
        user.id,
      );
      createdWorkflowIds.push({ id: workflowId, versionId, def: wf.definition, status: wf.status, trigger: wf.triggerType });
    }

    // Demo execution history (clearly tied to the demo workspace).
    const invoice = createdWorkflowIds[0];
    const summary = createdWorkflowIds[2];
    const lead = createdWorkflowIds[1];

    const executionPlan: Array<{
      wf: (typeof createdWorkflowIds)[number];
      hoursAgo: number;
      status: "succeeded" | "failed";
      failNode?: string;
      error?: string;
      mode: "simulation" | "live";
    }> = [
      { wf: invoice, hoursAgo: 2, status: "succeeded", mode: "simulation" },
      { wf: invoice, hoursAgo: 7, status: "succeeded", mode: "simulation" },
      { wf: invoice, hoursAgo: 19, status: "failed", failNode: "add_invoice_row", error: "Simulated Google Sheets quota error. The row was not written.", mode: "simulation" },
      { wf: invoice, hoursAgo: 26, status: "succeeded", mode: "simulation" },
      { wf: summary, hoursAgo: 30, status: "succeeded", mode: "simulation" },
      { wf: invoice, hoursAgo: 48, status: "succeeded", mode: "simulation" },
      { wf: lead, hoursAgo: 54, status: "failed", failNode: "send_confirmation", error: "Gmail Send Email is missing a recipient.", mode: "simulation" },
      { wf: invoice, hoursAgo: 72, status: "succeeded", mode: "simulation" },
      { wf: summary, hoursAgo: 96, status: "succeeded", mode: "simulation" },
      { wf: invoice, hoursAgo: 120, status: "succeeded", mode: "simulation" },
    ];

    for (const plan of executionPlan) {
      const started = new Date(now - plan.hoursAgo * 3600 * 1000);
      const nodeOrder = orderOf(plan.wf.def);
      let cursor = started.getTime();
      const executionId = newId("exe");
      const steps: Array<{
        nodeId: string;
        type: string;
        title: string;
        status: string;
        startedAt: string;
        finishedAt: string;
        duration: number;
        input: unknown;
        output: unknown;
        error?: string;
      }> = [];
      let failed = false;
      for (const node of nodeOrder) {
        const def = getNodeDefinition(node.type);
        const duration = 180 + Math.floor(Math.random() * 700);
        const stepStarted = new Date(cursor);
        cursor += duration;
        if (failed) {
          steps.push({
            nodeId: node.id,
            type: node.type,
            title: node.title || def?.title || node.type,
            status: "skipped",
            startedAt: stepStarted.toISOString(),
            finishedAt: stepStarted.toISOString(),
            duration: 0,
            input: {},
            output: {},
          });
          continue;
        }
        const isFail = plan.status === "failed" && plan.failNode === node.id;
        steps.push({
          nodeId: node.id,
          type: node.type,
          title: node.title || def?.title || node.type,
          status: isFail ? "failed" : "succeeded",
          startedAt: stepStarted.toISOString(),
          finishedAt: new Date(cursor).toISOString(),
          duration,
          input: sampleInputFor(node.type),
          output: isFail ? {} : sampleOutputFor(node.type),
          error: isFail ? plan.error : undefined,
        });
        if (isFail) failed = true;
      }
      const finished = new Date(cursor);
      run(
        `INSERT INTO executions (id, workspace_id, workflow_id, workflow_version_id, status, mode, trigger_source, started_at, finished_at, duration_ms, error_summary, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'demo_seed', ?, ?, ?, ?, 1, ?)`,
        executionId,
        workspace.id,
        plan.wf.id,
        plan.wf.versionId,
        plan.status,
        plan.mode,
        started.toISOString(),
        finished.toISOString(),
        cursor - started.getTime(),
        plan.status === "failed" ? plan.error ?? "Execution failed." : null,
        started.toISOString(),
      );
      let seq = 0;
      for (const step of steps) {
        run(
          `INSERT INTO execution_steps (id, execution_id, node_id, node_type, node_title, status, started_at, finished_at, duration_ms, sanitized_input, sanitized_output, error_code, error_message, attempt, seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          newId("stp"),
          executionId,
          step.nodeId,
          step.type,
          step.title,
          step.status,
          step.startedAt,
          step.finishedAt,
          step.duration,
          JSON.stringify(step.input),
          JSON.stringify(step.output),
          step.error ? "SIMULATED_FAILURE" : null,
          step.error ?? null,
          seq++,
        );
      }
      if (plan.status === "succeeded") {
        run("UPDATE workflows SET last_run_at = ?, last_run_status = 'succeeded' WHERE id = ?", finished.toISOString(), plan.wf.id);
      } else {
        run("UPDATE workflows SET last_run_at = ?, last_run_status = 'failed' WHERE id = ?", finished.toISOString(), plan.wf.id);
      }
    }

    // AI usage records for the demo month.
    for (let i = 0; i < 4; i++) {
      run(
        "INSERT INTO usage_records (id, workspace_id, usage_type, quantity, recorded_at, metadata_json) VALUES (?, ?, 'ai_generation', 1, ?, '{}')",
        newId("usg"),
        workspace.id,
        new Date(now - i * 86400000).toISOString(),
      );
    }
  });
}

function orderOf(def: WorkflowDefinition) {
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const indegree = new Map(def.nodes.map((n) => [n.id, 0]));
  for (const e of def.edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  const queue = def.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).sort((a, b) => a.position.x - b.position.x);
  const order: typeof def.nodes = [];
  while (queue.length) {
    const node = queue.shift()!;
    order.push(node);
    for (const e of def.edges.filter((edge) => edge.source === node.id)) {
      const next = (indegree.get(e.target) ?? 1) - 1;
      indegree.set(e.target, next);
      if (next === 0) {
        const target = byId.get(e.target);
        if (target) queue.push(target);
      }
    }
  }
  return order.length ? order : def.nodes;
}

function sampleInputFor(type: string): unknown {
  if (type === "gmail.new_email") return { query: "is:unread subject:invoice" };
  if (type === "gmail.search_emails") return { query: "newer_than:1d", maxResults: 10 };
  if (type === "ai.extract") return { text: "Invoice #INV-2043 from Northwind Traders for $1,280.00 due 2026-11-15." };
  if (type === "ai.summarize") return { style: "bullets", maxLength: 800 };
  if (type === "google_sheets.add_row") return { sheetName: "Invoices", mapping: 4 };
  if (type === "gmail.send_email") return { to: "customer@example.com" };
  if (type === "logic.filter") return { operator: "exists" };
  return {};
}

function sampleOutputFor(type: string): unknown {
  switch (type) {
    case "manual.trigger":
      return {
        triggered_at: new Date().toISOString(),
        input: {
          name: "Jordan Lee",
          email: "jordan@example.com",
          company: "Brightside Co.",
          message: "Hi, we need help automating our invoice intake. Can you call me this week?",
          text: "Invoice #INV-2043 from Northwind Traders for $1,280.00 due 2026-11-15.",
        },
      };
    case "schedule.trigger":
      return { scheduled_at: new Date().toISOString() };
    case "gmail.new_email":
      return {
        subject: "Invoice INV-2043 from Northwind Traders",
        from: "billing@northwind.example",
        to: "demo@flowmate.ai",
        snippet: "Please find invoice INV-2043 for $1,280.00 due November 15.",
        body: "Hi, please find invoice INV-2043 for $1,280.00 due 2026-11-15. Thanks, Northwind Traders.",
        received_at: new Date().toISOString(),
        message_id: "demo-msg-2043",
      };
    case "gmail.search_emails":
      return {
        count: 3,
        combined_text: "3 new messages: invoice question, meeting follow-up, newsletter.",
        messages: [
          { subject: "Invoice question", from: "billing@northwind.example", snippet: "Could you confirm the amount?" },
          { subject: "Meeting follow-up", from: "sam@example.com", snippet: "Thanks for the call." },
          { subject: "Weekly newsletter", from: "news@example.com", snippet: "Product updates." },
        ],
      };
    case "ai.extract":
      return {
        extracted: { invoice_number: "INV-2043", vendor: "Northwind Traders", amount: "1280.00", due_date: "2026-11-15" },
        invoice_number: "INV-2043",
        vendor: "Northwind Traders",
        amount: "1280.00",
        due_date: "2026-11-15",
        fields_found: 4,
      };
    case "ai.summarize":
      return {
        summary:
          "• 3 messages need attention\n• One invoice confirmation request from Northwind Traders\n• One meeting follow-up from Sam\n• One newsletter can be archived",
        source_length: 640,
      };
    case "google_sheets.add_row":
      return { updatedRange: "Invoices!A2:D2", rowIndex: 2 };
    case "google_sheets.find_row":
      return { found: true, row: { Email: "jordan@example.com" }, rowIndex: 4 };
    case "google_sheets.new_row":
      return { row: { Name: "Jordan Lee", Email: "", Company: "Brightside" }, rowIndex: 12 };
    case "gmail.send_email":
      return { message_id: "simulated-msg-7781", status: "simulated" };
    case "logic.filter":
      return { passed: false, value: "" };
    default:
      return {};
  }
}

export function seedDatabase(): void {
  seedTemplates();
  ensureDemoUser();
  seedDemoData();
}

export function demoWorkflowCount(): number {
  const row = get<{ c: number }>("SELECT COUNT(*) as c FROM workflows WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_demo = 1)");
  return row?.c ?? 0;
}

export function countRows(table: string): number {
  const row = get<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
  return row?.c ?? 0;
}

export { parseJson, all, db };
