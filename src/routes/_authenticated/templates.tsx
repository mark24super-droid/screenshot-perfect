import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Zap, Rocket } from "lucide-react";
import { listTemplates, instantiateTemplate } from "@/lib/workflows.functions";
import { PageHeader } from "@/components/flowmate/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { integrationLabelsForDefinition, type TemplateRow } from "@/lib/template-utils";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Templates — FlowMate AI" },
      { name: "description", content: "Ready-made workflow templates to start from." },
      { property: "og:title", content: "Templates — FlowMate AI" },
      { property: "og:description", content: "Ready-made workflow templates to start from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const fetchTemplates = useServerFn(listTemplates);
  const instantiate = useServerFn(instantiateTemplate);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates(), retry: 1 });
  const useMutationTemplate = useMutation({
    mutationFn: (slug: string) => instantiate({ data: { slug } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Template copied — highlight what's missing in the editor.");
      navigate({ to: "/automations/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not use this template."),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Templates"
        subtitle="Start from a proven workflow. Templates are copied into your workspace as drafts — they never activate automatically."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load templates</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : "Something went wrong."}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((t) => (
            <TemplateCard key={t.slug} template={t} onUse={() => useMutationTemplate.mutate(t.slug)} busy={useMutationTemplate.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, onUse, busy }: { template: TemplateRow; onUse: () => void; busy: boolean }) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
            <Zap className="h-4.5 w-4.5 text-primary" />
          </div>
          <Badge variant="outline" className="text-[10px]">{template.complexity === "medium" ? "Medium setup" : "Simple setup"}</Badge>
        </div>
        <div className="mt-1 font-semibold">{template.name}</div>
        <p className="flex-1 text-sm text-muted-foreground">{template.description}</p>
        <div className="text-xs text-muted-foreground">
          {integrationLabelsForDefinition(template.definition).length === 0
            ? "No external integrations"
            : `Uses ${integrationLabelsForDefinition(template.definition).join(" + ")}`}
        </div>
        <Button size="sm" className="mt-2" onClick={onUse} disabled={busy}>
          <Rocket className="h-4 w-4" /> Use Template
        </Button>
      </CardContent>
    </Card>
  );
}
