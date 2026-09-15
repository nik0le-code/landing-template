/**
 * CSV export of the current inbox filters (session required: /admin/* middleware).
 * UTF-8 with BOM so Excel shows Greek correctly; cells that look like formulas are
 * prefixed to prevent CSV injection.
 */
import type { APIRoute } from "astro";
import { LEAD_STATUSES } from "../../options";
import { iterateLeads } from "../../lib/queries";

const COLUMNS = ["createdAt", "form", "status", "name", "email", "phone", "company", "subject", "message", "locale", "pagePath", "attribution", "notes"] as const;

function cell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET: APIRoute = ({ url }) => {
  const status = url.searchParams.get("status") ?? "";
  const filters = {
    status: (LEAD_STATUSES as readonly string[]).includes(status) ? status : "",
    form: url.searchParams.get("form") ?? "",
    query: (url.searchParams.get("q") ?? "").slice(0, 100),
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`﻿${COLUMNS.join(",")}\r\n`));
      for await (const rows of iterateLeads(filters)) {
        controller.enqueue(encoder.encode(rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(",")).join("\r\n") + "\r\n"));
      }
      controller.close();
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
    },
  });
};
