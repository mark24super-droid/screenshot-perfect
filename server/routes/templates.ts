import { Router } from "express";
import { z } from "zod";
import { asyncHandler, fail, ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { all, get } from "../db";
import { TEMPLATES } from "@shared/templates";
import { createWorkflow } from "../services/workflows";

export const templatesRouter = Router();

interface TemplateRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  definition_json: string;
  is_demo_only: number;
  complexity: string;
}

function templateMeta(row: TemplateRow) {
  const template = TEMPLATES.find((t) => t.slug === row.slug);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    complexity: row.complexity,
    demoOnly: Boolean(row.is_demo_only),
    integrations: template?.integrations ?? [],
    highlights: template?.highlights ?? [],
    definition: JSON.parse(row.definition_json),
  };
}

templatesRouter.get(
  "/",
  requireAuth,
  asyncHandler((req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : "";
    const category = typeof req.query.category === "string" ? req.query.category : "all";
    const rows = all<TemplateRow>("SELECT * FROM templates WHERE is_published = 1 ORDER BY name ASC");
    let items = rows.map(templateMeta);
    if (search) {
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.description.toLowerCase().includes(search) ||
          t.category.toLowerCase().includes(search),
      );
    }
    if (category !== "all") items = items.filter((t) => t.category === category);
    const categories = [...new Set(rows.map((r) => r.category))].sort();
    ok(res, { items, total: items.length, categories });
  }),
);

templatesRouter.get(
  "/:slug",
  requireAuth,
  asyncHandler((req, res) => {
    const row = get<TemplateRow>("SELECT * FROM templates WHERE slug = ? OR id = ?", req.params.slug, req.params.slug);
    if (!row) {
      fail(res, 404, "template_not_found", "Template not found.");
      return;
    }
    ok(res, templateMeta(row));
  }),
);

templatesRouter.post(
  "/:slug/instantiate",
  requireAuth,
  asyncHandler((req, res) => {
    const body = z.object({ name: z.string().trim().max(120).optional() }).parse(req.body ?? {});
    const row = get<TemplateRow>("SELECT * FROM templates WHERE slug = ? OR id = ?", req.params.slug, req.params.slug);
    if (!row) {
      fail(res, 404, "template_not_found", "Template not found.");
      return;
    }
    const detail = createWorkflow({
      workspaceId: req.auth!.workspace.id,
      userId: req.auth!.user.id,
      name: body.name || row.name,
      description: row.description,
      definition: JSON.parse(row.definition_json),
    });
    ok(
      res,
      {
        ...detail,
        note: "Template copied as a draft. Review the highlighted configuration before activating. Nothing was activated automatically.",
      },
      201,
    );
  }),
);
