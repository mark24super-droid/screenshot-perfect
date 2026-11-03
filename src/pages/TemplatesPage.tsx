import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Blocks, Check, Eye, FlaskConical, Search, Sparkles } from "lucide-react";
import { PageContainer, PageTitle } from "../components/layout/AppShell";
import { Badge, Card, CardBody, Skeleton } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { EmptyState, ErrorState, Tabs } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { NodeIcon, ProviderIcon } from "../lib/icons";
import { apiGet, apiPost, errorMessage } from "../lib/api";
import type { TemplateItem, WorkflowDetail } from "../lib/types";
import { getNodeDefinition } from "@shared/nodes";
import { providerLabel } from "../lib/utils";

interface TemplateResponse {
  items: TemplateItem[];
  total: number;
  categories: string[];
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = React.useState<TemplateResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [preview, setPreview] = React.useState<TemplateItem | null>(null);
  const [usingSlug, setUsingSlug] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<TemplateResponse>("/templates"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const useTemplate = async (template: TemplateItem) => {
    setUsingSlug(template.slug);
    try {
      const detail = await apiPost<WorkflowDetail & { note?: string }>(`/templates/${template.slug}/instantiate`, {});
      toast({
        title: "Template copied as a draft",
        description: "Review the highlighted configuration before activating. Nothing was activated automatically.",
        variant: "success",
      });
      navigate(`/automations/${detail.id}`);
    } catch (err) {
      toast({ title: "Could not use template", description: errorMessage(err), variant: "error" });
    } finally {
      setUsingSlug(null);
    }
  };

  const filtered = (data?.items ?? []).filter((template) => {
    if (category !== "all" && template.category !== category) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.category.toLowerCase().includes(query)
    );
  });

  return (
    <PageContainer>
      <PageTitle
        title="Templates"
        description="Reviewed starting points using approved steps. Each template creates a draft copy that you configure and test before activation."
        actions={
          <Button variant="secondary" onClick={() => navigate("/automations/new")}>
            <Sparkles size={15} /> Describe with AI
          </Button>
        }
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {data ? (
          <Tabs
            value={category}
            onChange={setCategory}
            items={[{ value: "all", label: "All", count: data.items.length }, ...data.categories.map((item) => ({ value: item, label: item }))]}
          />
        ) : (
          <Skeleton className="h-9 w-64" />
        )}
        <div className="relative w-full lg:w-[300px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates…" className="pl-8" aria-label="Search templates" />
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <Card key={item}>
                <CardBody className="space-y-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-8 w-full" />
                </CardBody>
              </Card>
            ))}
          </div>
        ) : error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Blocks size={20} />}
            title="No templates match"
            description="Try a different search or category. Templates are read-only and never modified when used."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((template) => (
              <Card key={template.id} className="flex flex-col">
                <CardBody className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Blocks size={16} />
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge tone="outline">{template.category}</Badge>
                      <Badge tone="neutral">{template.complexity}</Badge>
                      {template.demoOnly ? <Badge tone="warning">Simulation only</Badge> : null}
                    </div>
                  </div>
                  <h2 className="mt-2.5 text-[13.5px] font-semibold text-ink">{template.name}</h2>
                  <p className="mt-1 flex-1 text-[11.5px] leading-relaxed text-ink-secondary">{template.description}</p>

                  <ul className="mt-3 space-y-1">
                    {template.highlights.slice(0, 3).map((highlight) => (
                      <li key={highlight} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
                        <Check size={11} className="mt-0.5 shrink-0 text-success" /> {highlight}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                    {template.integrations.map((provider) => (
                      <span key={provider} className="inline-flex items-center gap-1 rounded border border-line bg-app/60 px-1.5 py-0.5 text-[10px] text-ink-secondary">
                        <ProviderIcon provider={provider} className="h-4 w-4 [&>svg]:h-2.5 [&>svg]:w-2.5" />
                        {providerLabel(provider)}
                      </span>
                    ))}
                    <span className="ml-auto text-[10px] text-ink-secondary">{template.definition.nodes.length} steps</span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => setPreview(template)}>
                      <Eye size={13} /> Preview
                    </Button>
                    <Button size="sm" className="flex-1" loading={usingSlug === template.slug} onClick={() => void useTemplate(template)}>
                      Use template <ArrowRight size={13} />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <TemplatePreviewDialog
        template={preview}
        onClose={() => setPreview(null)}
        onUse={(template) => {
          setPreview(null);
          void useTemplate(template);
        }}
        loading={Boolean(preview && usingSlug === preview.slug)}
      />
    </PageContainer>
  );
}

function TemplatePreviewDialog({
  template,
  onClose,
  onUse,
  loading,
}: {
  template: TemplateItem | null;
  onClose: () => void;
  onUse: (template: TemplateItem) => void;
  loading: boolean;
}) {
  if (!template) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={template.name}
      description={template.description}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button onClick={() => onUse(template)} loading={loading}>
            Use this template <ArrowRight size={14} />
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="outline">{template.category}</Badge>
          <Badge tone="neutral">{template.complexity}</Badge>
          {template.demoOnly ? <Badge tone="warning">Simulation only</Badge> : <Badge tone="success">Live-capable with connections</Badge>}
        </div>

        {template.demoOnly ? (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
            <FlaskConical size={14} className="mt-0.5 shrink-0" />
            This template contains a simulation-only step. Live validation will block activation until the step is removed or replaced.
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Steps</p>
          <ol className="mt-2 space-y-1.5">
            {template.definition.nodes.map((node, index) => {
              const def = getNodeDefinition(node.type);
              return (
                <li key={node.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-app/40 px-3 py-2">
                  <NodeIcon type={node.type} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-ink">{node.title || def?.title || node.type}</p>
                    <p className="truncate text-[10.5px] text-ink-secondary">{def?.description || node.type}</p>
                  </div>
                  <Badge tone={def?.kind === "trigger" ? "purple" : "neutral"}>{def?.kind === "trigger" ? "Trigger" : `Step ${index + 1}`}</Badge>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">Requires</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {template.integrations.length === 0 ? (
              <span className="text-[11px] text-ink-secondary">No external integrations.</span>
            ) : (
              template.integrations.map((provider) => (
                <span key={provider} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink">
                  <ProviderIcon provider={provider} className="h-5 w-5 [&>svg]:h-3 [&>svg]:w-3" />
                  {providerLabel(provider)}
                </span>
              ))
            )}
          </div>
        </div>

        <p className="rounded-lg border border-line bg-app/60 p-3 text-[11px] leading-relaxed text-ink-secondary">
          Using a template creates a new draft in your workspace. The template itself is not changed, and the copy is not
          activated. Missing spreadsheet IDs and connection requirements are highlighted in the editor.
        </p>
      </div>
    </Dialog>
  );
}
