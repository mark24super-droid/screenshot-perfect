import type { WorkflowDefinition } from "./workflow";
import type { ProviderId } from "./nodes";

export interface TemplateDefinition {
  slug: string;
  name: string;
  description: string;
  category: string;
  complexity: "Easy" | "Medium";
  integrations: ProviderId[];
  demoOnly: boolean;
  highlights: string[];
  definition: WorkflowDefinition;
}

const edge = (source: string, target: string, label?: string) => ({
  id: `e-${source}-${target}`,
  source,
  target,
  ...(label ? { label } : {}),
});

export const TEMPLATES: TemplateDefinition[] = [
  {
    slug: "email-to-google-sheets",
    name: "Email to Google Sheets",
    description:
      "Read a matching Gmail message, extract invoice details with AI, and append a row to a spreadsheet.",
    category: "Email",
    complexity: "Medium",
    integrations: ["gmail", "ai", "google_sheets"],
    demoOnly: false,
    highlights: ["Invoice fields extracted automatically", "Appends one row per email", "Works in simulation mode"],
    definition: {
      version: 1,
      nodes: [
        {
          id: "gmail_trigger",
          type: "gmail.new_email",
          title: "New invoice email",
          config: { query: "is:unread subject:invoice" },
          position: { x: 60, y: 120 },
        },
        {
          id: "extract_invoice",
          type: "ai.extract",
          title: "Extract invoice data",
          config: {
            text: "{{gmail_trigger.body}}",
            fields: "invoice_number, vendor, amount, due_date",
            outputVariable: "extracted",
          },
          position: { x: 380, y: 120 },
        },
        {
          id: "add_invoice_row",
          type: "google_sheets.add_row",
          title: "Save to Invoices sheet",
          config: {
            spreadsheetId: "",
            sheetName: "Invoices",
            mapping: [
              { column: "Invoice number", value: "{{extract_invoice.invoice_number}}" },
              { column: "Vendor", value: "{{extract_invoice.vendor}}" },
              { column: "Amount", value: "{{extract_invoice.amount}}" },
              { column: "Due date", value: "{{extract_invoice.due_date}}" },
            ],
          },
          position: { x: 700, y: 120 },
        },
      ],
      edges: [
        edge("gmail_trigger", "extract_invoice", "new email"),
        edge("extract_invoice", "add_invoice_row", "fields ready"),
      ],
    },
  },
  {
    slug: "contact-form-follow-up",
    name: "Contact Form Follow-up",
    description:
      "Take a sample form submission, extract contact details, and send a confirmation email from Gmail.",
    category: "Leads",
    complexity: "Easy",
    integrations: ["ai", "gmail"],
    demoOnly: false,
    highlights: ["Uses manual input as the form trigger", "Extracts name, email and message", "Draft email is pre-written"],
    definition: {
      version: 1,
      nodes: [
        {
          id: "form_trigger",
          type: "manual.trigger",
          title: "Form submission",
          config: {},
          position: { x: 60, y: 120 },
        },
        {
          id: "extract_lead",
          type: "ai.extract",
          title: "Extract contact details",
          config: {
            text: "{{form_trigger.input.message}}",
            fields: "name, email, company, message",
            outputVariable: "extracted",
          },
          position: { x: 380, y: 120 },
        },
        {
          id: "send_confirmation",
          type: "gmail.send_email",
          title: "Send confirmation",
          config: {
            to: "{{extract_lead.email}}",
            subject: "Thanks for contacting us, {{extract_lead.name}}",
            body: "Hi {{extract_lead.name}},\n\nThanks for reaching out. We received your message and will reply shortly.\n\n— The team",
          },
          position: { x: 700, y: 120 },
        },
      ],
      edges: [
        edge("form_trigger", "extract_lead", "submission"),
        edge("extract_lead", "send_confirmation", "contact ready"),
      ],
    },
  },
  {
    slug: "daily-email-summary",
    name: "Daily Email Summary",
    description: "Every morning, read recent emails, summarize them, and prepare a report email.",
    category: "Reporting",
    complexity: "Medium",
    integrations: ["gmail", "ai"],
    demoOnly: false,
    highlights: ["Runs on a daily schedule (UTC)", "Summarizes recent emails", "Sends a report to a recipient you configure"],
    definition: {
      version: 1,
      nodes: [
        {
          id: "morning_schedule",
          type: "schedule.trigger",
          title: "Every morning",
          config: { frequency: "daily", time: "08:00", dayOfWeek: "1" },
          position: { x: 60, y: 120 },
        },
        {
          id: "recent_emails",
          type: "gmail.search_emails",
          title: "Read recent emails",
          config: { query: "newer_than:1d", maxResults: 10 },
          position: { x: 380, y: 120 },
        },
        {
          id: "summarize_inbox",
          type: "ai.summarize",
          title: "Summarize inbox",
          config: {
            text: "{{recent_emails.combined_text}}",
            style: "bullets",
            maxLength: 800,
            outputVariable: "summary",
          },
          position: { x: 700, y: 120 },
        },
        {
          id: "send_report",
          type: "gmail.send_email",
          title: "Send daily report",
          config: {
            to: "",
            subject: "Your daily email summary",
            body: "Here is your summary:\n\n{{summarize_inbox.summary}}",
          },
          position: { x: 1020, y: 120 },
        },
      ],
      edges: [
        edge("morning_schedule", "recent_emails", "scheduled"),
        edge("recent_emails", "summarize_inbox", "emails"),
        edge("summarize_inbox", "send_report", "summary ready"),
      ],
    },
  },
  {
    slug: "spreadsheet-data-validation",
    name: "Spreadsheet Data Validation",
    description: "Check new spreadsheet rows for missing fields and alert you when data is incomplete.",
    category: "Data",
    complexity: "Medium",
    integrations: ["google_sheets", "gmail"],
    demoOnly: true,
    highlights: ["Simulation-only new-row trigger", "Checks a required value", "Alerts a recipient you configure"],
    definition: {
      version: 1,
      nodes: [
        {
          id: "new_sheet_row",
          type: "google_sheets.new_row",
          title: "New spreadsheet row",
          config: { spreadsheetId: "", sheetName: "Leads" },
          position: { x: 60, y: 120 },
        },
        {
          id: "check_email",
          type: "logic.filter",
          title: "Require an email",
          config: { left: "{{new_sheet_row.row.Email}}", operator: "exists", right: "" },
          position: { x: 380, y: 120 },
        },
        {
          id: "alert_missing",
          type: "gmail.send_email",
          title: "Send data alert",
          config: {
            to: "",
            subject: "Spreadsheet row needs attention",
            body: "A new row is missing required data. Please review the sheet.",
          },
          position: { x: 700, y: 120 },
        },
      ],
      edges: [
        edge("new_sheet_row", "check_email", "row added"),
        edge("check_email", "alert_missing", "missing data"),
      ],
    },
  },
  {
    slug: "customer-support-summary",
    name: "Customer Support Summary",
    description: "Summarize a support message into a short internal note you can review.",
    category: "Support",
    complexity: "Easy",
    integrations: ["ai"],
    demoOnly: false,
    highlights: ["Sample message included", "Bullet-point summary", "No email is sent automatically"],
    definition: {
      version: 1,
      nodes: [
        {
          id: "support_input",
          type: "manual.trigger",
          title: "Support message",
          config: {},
          position: { x: 60, y: 120 },
        },
        {
          id: "summarize_ticket",
          type: "ai.summarize",
          title: "Summarize message",
          config: {
            text: "{{support_input.input.message}}",
            style: "bullets",
            maxLength: 500,
            outputVariable: "summary",
          },
          position: { x: 380, y: 120 },
        },
      ],
      edges: [edge("support_input", "summarize_ticket", "message")],
    },
  },
  {
    slug: "ai-text-extraction",
    name: "AI Text Extraction",
    description: "Paste any text and extract custom fields into a structured record.",
    category: "AI",
    complexity: "Easy",
    integrations: ["ai"],
    demoOnly: false,
    highlights: ["Define your own fields", "Structured JSON output", "Great starting point for AI steps"],
    definition: {
      version: 1,
      nodes: [
        {
          id: "text_input",
          type: "manual.trigger",
          title: "Paste text",
          config: {},
          position: { x: 60, y: 120 },
        },
        {
          id: "extract_fields",
          type: "ai.extract",
          title: "Extract fields",
          config: {
            text: "{{text_input.input.text}}",
            fields: "name, email, company, intent",
            outputVariable: "extracted",
          },
          position: { x: 380, y: 120 },
        },
      ],
      edges: [edge("text_input", "extract_fields", "text")],
    },
  },
];

export function templateBySlug(slug: string): TemplateDefinition | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}
