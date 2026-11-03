import { describe, expect, it } from "vitest";
import {
  executionOrder,
  runWorkflow,
  sanitize,
  type EngineStepResult,
} from "@/lib/engine.server";
import type { WorkflowDefinition } from "@/lib/workflow-schema";

const trigger = {
  id: "trigger_1",
  type: "manual.trigger" as const,
  config: {},
  position: { x: 0, y: 0 },
};

function graph(
  nodes: WorkflowDefinition["nodes"],
  edges: WorkflowDefinition["edges"],
): WorkflowDefinition {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

describe("executionOrder", () => {
  it("returns a topological order that starts at the trigger", () => {
    const definition = graph(
      [
        trigger,
        { id: "a", type: "ai.summarize", config: { source: "x" }, position: { x: 1, y: 0 } },
        { id: "b", type: "ai.summarize", config: { source: "x" }, position: { x: 2, y: 0 } },
        { id: "c", type: "ai.extract", config: { source: "x", fields: ["a"] }, position: { x: 3, y: 0 } },
      ],
      [
        { id: "e1", source: "trigger_1", target: "a" },
        { id: "e2", source: "trigger_1", target: "b" },
        { id: "e3", source: "a", target: "c" },
        { id: "e4", source: "b", target: "c" },
      ],
    );

    const order = executionOrder(definition);
    expect(order[0]!.id).toBe("trigger_1");
    expect(order.at(-1)!.id).toBe("c");
    expect(order).toHaveLength(4);
  });

  it("skips nodes that are not reachable from the trigger", () => {
    const definition = graph(
      [
        trigger,
        { id: "a", type: "ai.summarize", config: { source: "x" }, position: { x: 1, y: 0 } },
        { id: "orphan", type: "ai.summarize", config: { source: "x" }, position: { x: 1, y: 1 } },
      ],
      [{ id: "e1", source: "trigger_1", target: "a" }],
    );

    expect(executionOrder(definition).map((n) => n.id)).toEqual(["trigger_1", "a"]);
  });

  it("returns nothing when there is no trigger", () => {
    const definition = graph(
      [{ id: "a", type: "ai.summarize", config: { source: "x" }, position: { x: 0, y: 0 } }],
      [],
    );
    expect(executionOrder(definition)).toEqual([]);
  });
});

describe("runWorkflow simulation", () => {
  it("runs a manual chain and labels simulated outputs", async () => {
    const definition = graph(
      [
        trigger,
        {
          id: "ai_1",
          type: "ai.summarize",
          config: { source: "{{trigger_1.text}}", style: "paragraph", maxLength: 20 },
          position: { x: 1, y: 0 },
        },
      ],
      [{ id: "e1", source: "trigger_1", target: "ai_1" }],
    );

    const result = await runWorkflow(definition, {
      mode: "simulation",
      userId: "test-user",
      outputs: {},
      input: { text: "Hello there this is a test message about invoices and billing" },
    });

    expect(result.status).toBe("succeeded");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.status).toBe("succeeded");
    expect(result.steps[0]!.output["simulated"]).toBe(true);
    expect(result.steps[1]!.output["simulated"]).toBe(true);
    expect(result.steps[1]!.output["ai_fallback"]).toBe(true);
    expect(typeof result.steps[1]!.output["summary"]).toBe("string");
  });

  it("stops a branch when a filter condition fails", async () => {
    const definition = graph(
      [
        trigger,
        {
          id: "filter_1",
          type: "logic.filter",
          config: { field: "{{trigger_1.text}}", operator: "contains", value: "invoice" },
          position: { x: 1, y: 0 },
        },
        {
          id: "send_1",
          type: "gmail.send_email",
          config: { to: "a@example.com", subject: "Hi", body: "Body" },
          position: { x: 2, y: 0 },
        },
      ],
      [
        { id: "e1", source: "trigger_1", target: "filter_1" },
        { id: "e2", source: "filter_1", target: "send_1" },
      ],
    );

    const result = await runWorkflow(definition, {
      mode: "simulation",
      userId: "test-user",
      outputs: {},
      input: { text: "a totally unrelated message" },
    });

    const byId = Object.fromEntries(result.steps.map((s) => [s.nodeId, s])) as Record<string, EngineStepResult>;
    expect(byId["filter_1"]!.status).toBe("skipped");
    expect(byId["send_1"]!.status).toBe("skipped");
    expect(result.status).toBe("partially_succeeded");
    expect(result.errorSummary).toMatch(/condition/i);
  });

  it("records step inputs and attempts", async () => {
    const recorded: { nodeId: string; attempts: number; input: Record<string, unknown> }[] = [];
    const definition = graph(
      [
        trigger,
        {
          id: "send_1",
          type: "gmail.send_email",
          config: { to: "{{trigger_1.email}}", subject: "Hi", body: "Body" },
          position: { x: 1, y: 0 },
        },
      ],
      [{ id: "e1", source: "trigger_1", target: "send_1" }],
    );

    await runWorkflow(
      definition,
      { mode: "simulation", userId: "test-user", outputs: {}, input: { email: "x@example.com" } },
      async (node, _result, _duration, input, attempts) => {
        recorded.push({ nodeId: node.id, attempts, input });
      },
    );

    const sendStep = recorded.find((r) => r.nodeId === "send_1");
    expect(sendStep).toBeDefined();
    expect(sendStep!.attempts).toBe(1);
    expect(sendStep!.input["to"]).toBe("x@example.com");
  });
});

describe("sanitize", () => {
  it("redacts secret-like keys and truncates long strings", () => {
    const cleaned = sanitize({
      token: "abc",
      nested: { apiKey: "def", ok: "visible" },
      long: "x".repeat(3000),
    }) as Record<string, unknown>;

    expect(cleaned["token"]).toBe("[redacted]");
    expect((cleaned["nested"] as Record<string, unknown>)["apiKey"]).toBe("[redacted]");
    expect((cleaned["nested"] as Record<string, unknown>)["ok"]).toBe("visible");
    expect((cleaned["long"] as string).endsWith("…")).toBe(true);
  });
});
