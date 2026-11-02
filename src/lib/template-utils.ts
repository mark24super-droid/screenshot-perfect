import { INTEGRATION_LABELS, integrationForWorkflow, type WorkflowDefinition } from "@/lib/workflow-schema";

export interface TemplateRow {
  slug: string;
  name: string;
  description: string;
  category: string;
  complexity: string;
  definition: WorkflowDefinition;
}

export function integrationLabelsForDefinition(definition: WorkflowDefinition): string[] {
  return integrationForWorkflow(definition).map((i) => INTEGRATION_LABELS[i]);
}
