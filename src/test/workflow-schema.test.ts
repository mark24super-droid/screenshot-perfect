import { describe, expect, it } from "vitest";
import {
  normalizeWorkflowDefinition,
  parseVariableRefs,
  resolveTemplate,
  validateWorkflow,
  type WorkflowDefinition,
} from "@/lib/workflow-schema";

const manualTrigger = {
  id: "trigger_1",
  type: "manual.trigger" as const,
  config: { sampleInput: JSON.stringify({ text: "hello" }) },
  position: { x: 0, y: 0 },
};

function def(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    nodes: [manualTrigger],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

describe("normalizeWorkflowDefinition", () => {
  it("merges a legacy top-level trigger into nodes", () => {
    const normalized = normalizeWorkflowDefinition({
      trigger: { id: "trigger_1", type: "manual.trigger", config: {} },
      nodes: [{ id: "ai_1", type: "ai.summarize", config: { source: "{{trigger_1.text}}" } }],
      edges: [{ id: "e1", source: "trigger_1", target: "ai_1" }],
    });

    expect(normalized.nodes.map((n) => n.id)).toEqual(["trigger_1", "ai_1"]);
    expect(normalized.edges).toHaveLength(1);
    for (const node of normalized.nodes) {
      expect(node.position).toBeDefined();
    }
  });

  it("does not duplicate a trigger that is already in nodes", () => {
    const normalized = normalizeWorkflowDefinition({
      trigger: { id: "trigger_1", type: "manual.trigger", config: {} },
      nodes: [manualTrigger],
      edges: [],
    });

    expect(normalized.nodes).toHaveLength(1);
  });

  it("returns an empty definition for invalid input", () => {
    const normalized = normalizeWorkflowDefinition(null);
    expect(normalized.nodes).toEqual([]);
    expect(normalized.edges).toEqual([]);
  });
});

describe("validateWorkflow", () => {
  it("requires a trigger", () => {
    const issues = validateWorkflow(
      def({
        nodes: [{ ...manualTrigger, type: "ai.summarize", id: "ai_1", config: { source: "text" } }],
      }),
    );
    expect(issues.some((i) => i.level === "error" && i.message.includes("Add a trigger"))).toBe(true);
  });

  it("reports missing required configuration", () => {
    const issues = validateWorkflow(
      def({
        nodes: [
          manualTrigger,
          { id: "send_1", type: "gmail.send_email", config: { to: "" }, position: { x: 1, y: 0 } },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "send_1" }],
      }),
    );
    expect(issues.filter((i) => i.level === "error")).toHaveLength(3);
  });

  it("detects cycles", () => {
    const issues = validateWorkflow(
      def({
        nodes: [
          manualTrigger,
          { id: "a", type: "ai.summarize", config: { source: "text" }, position: { x: 1, y: 0 } },
        ],
        edges: [
          { id: "e1", source: "trigger_1", target: "a" },
          { id: "e2", source: "a", target: "trigger_1" },
        ],
      }),
    );
    expect(issues.some((i) => i.message.includes("contains a loop"))).toBe(true);
  });

  it("warns about a missing integration unless integrations are required", () => {
    const definition = def({
      nodes: [
        manualTrigger,
        {
          id: "send_1",
          type: "gmail.send_email",
          config: { to: "a@example.com", subject: "Hi", body: "Hello" },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "trigger_1", target: "send_1" }],
    });

    const warning = validateWorkflow(definition, { connectedIntegrations: [] });
    expect(warning.some((i) => i.level === "warning" && i.message.includes("Gmail"))).toBe(true);

    const error = validateWorkflow(definition, { connectedIntegrations: [], requireIntegrations: true });
    expect(error.some((i) => i.level === "error" && i.message.includes("Gmail"))).toBe(true);
  });

  it("flags references to unknown nodes", () => {
    const issues = validateWorkflow(
      def({
        nodes: [
          manualTrigger,
          { id: "ai_1", type: "ai.summarize", config: { source: "{{missing_1.text}}" }, position: { x: 1, y: 0 } },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "ai_1" }],
      }),
    );
    expect(issues.some((i) => i.message.includes("no node with that id"))).toBe(true);
  });
});

describe("template helpers", () => {
  it("parses variable references from nested config", () => {
    const refs = parseVariableRefs({ a: "{{trigger_1.text}}", b: ["{{ai_1.summary}}"] });
    expect(refs).toEqual([
      { nodeId: "trigger_1", field: "text" },
      { nodeId: "ai_1", field: "summary" },
    ]);
  });

  it("resolves full and embedded references", () => {
    const outputs = { trigger_1: { text: "hello", row: { a: 1 } } };
    expect(resolveTemplate("{{trigger_1.text}}", outputs)).toBe("hello");
    expect(resolveTemplate("Value: {{trigger_1.text}}", outputs)).toBe("Value: hello");
    expect(resolveTemplate("{{trigger_1.row}}", outputs)).toEqual({ a: 1 });
    expect(resolveTemplate("{{trigger_1.missing}}", outputs)).toBe("");
  });
});
