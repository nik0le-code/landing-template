/**
 * Admin media API (session required — enforced by middleware for /api/admin/*).
 *
 *   GET  /api/admin/media?q=&page=     JSON list for the picker
 *   POST /api/admin/media              multipart `files` → JSON (fetch) or redirect (plain form)
 *
 * Uploads use an endpoint instead of an Astro Action because actions cap request
 * bodies at 1 MB.
 */
import type { APIRoute } from "astro";
import { listMedia } from "../lib/queries";
import { MediaError, mediaOptions, processUpload } from "../lib/upload";
import { toPublic } from "../lib/urls";

const MAX_FILES_PER_REQUEST = 20;

export const GET: APIRoute = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const query = (url.searchParams.get("q") ?? "").slice(0, 100);
  const result = await listMedia({ query, page, pageSize: 24 });
  return Response.json({ ...result, items: result.items.map(toPublic) });
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const reply = (status: number, body: Record<string, unknown>, flash: string) =>
    wantsJson ? Response.json(body, { status }) : redirect(`/admin/media?${flash}`, 303);

  const { maxUploadMb } = mediaOptions();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxUploadMb * MAX_FILES_PER_REQUEST * 1024 * 1024) {
    return reply(413, { error: "tooLarge" }, "error=tooLarge");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { error: "invalid" }, "error=invalid");
  }
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0 || files.length > MAX_FILES_PER_REQUEST) return reply(400, { error: "invalid" }, "error=invalid");

  const items = [];
  const errors: { filename: string; error: string }[] = [];
  // Sequential on purpose: predictable memory/CPU on small nodes.
  for (const file of files) {
    try {
      items.push(toPublic(await processUpload(file, locals.user?.id ?? null)));
    } catch (error) {
      errors.push({ filename: file.name, error: error instanceof MediaError ? error.code : "invalid" });
      if (!(error instanceof MediaError)) console.error("[media] upload failed", error);
    }
  }

  const status = items.length ? 201 : 400;
  return reply(status, { items, errors }, errors.length ? `flash=created&error=${errors[0]!.error}` : "flash=created");
};
