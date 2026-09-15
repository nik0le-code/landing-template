/**
 * Renders editor Markdown exactly like a saved post (session required via
 * /api/admin middleware). JSON body → a cross-site form can't post here, and the
 * Origin check below rejects cross-site fetches.
 */
import type { APIRoute } from "astro";
import { renderMarkdown } from "../../lib/markdown";

export const POST: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return new Response(null, { status: 415 });

  const body = (await request.json().catch(() => null)) as { markdown?: unknown } | null;
  const markdown = typeof body?.markdown === "string" ? body.markdown.slice(0, 200_000) : "";
  const { html, headings, readingMinutes } = await renderMarkdown(markdown);
  return Response.json({ html, headings, readingMinutes });
};
