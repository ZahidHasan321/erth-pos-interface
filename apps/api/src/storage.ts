// File storage on local disk (replaces Supabase Storage). URL layout is kept
// identical to Supabase's so existing stored media URLs only need their host
// swapped during migration:
//
//   POST   /storage/v1/object/:bucket/<path>          upload (raw body, upsert)
//   DELETE /storage/v1/object/:bucket { prefixes }    remove
//   GET    /storage/v1/object/public/:bucket/<path>   public read (Caddy serves
//          this straight from disk in production; the route here is for dev)

import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { env } from "./env.js";
import { bearer, verifyAccessToken } from "./jwt.js";

const BUCKETS = new Set(["media"]);

/** Resolve bucket/objectPath under the storage root, or null if it escapes. */
function resolveObject(bucket: string, objectPath: string): string | null {
  if (!BUCKETS.has(bucket) || !objectPath || objectPath.includes("\0")) return null;
  const root = path.resolve(env.storageDir, bucket);
  const full = path.resolve(root, objectPath);
  return full.startsWith(root + path.sep) ? full : null;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  svg: "image/svg+xml", pdf: "application/pdf", webm: "audio/webm", mp3: "audio/mpeg",
  m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", mov: "video/quicktime",
};

export const storageRoutes = new Hono();

storageRoutes.get("/object/public/:bucket/*", async (c) => {
  const bucket = c.req.param("bucket");
  const objectPath = decodeURIComponent(c.req.path.split(`/object/public/${bucket}/`)[1] ?? "");
  const full = resolveObject(bucket, objectPath);
  if (!full) return c.json({ error: "Not found" }, 404);
  const st = await stat(full).catch(() => null);
  if (!st?.isFile()) return c.json({ error: "Not found" }, 404);
  const ext = path.extname(full).slice(1).toLowerCase();
  c.header("Content-Type", MIME[ext] ?? "application/octet-stream");
  c.header("Content-Length", String(st.size));
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(Readable.toWeb(createReadStream(full)) as ReadableStream);
});

// Everything below needs a signed-in user.
storageRoutes.use("/object/:bucket/*", async (c, next) => {
  if (c.req.method === "GET") return next();
  const claims = await verifyAccessToken(bearer(c.req.header("authorization")) ?? "");
  if (!claims) return c.json({ error: "Not authenticated" }, 401);
  return next();
});
storageRoutes.use("/object/:bucket", async (c, next) => {
  const claims = await verifyAccessToken(bearer(c.req.header("authorization")) ?? "");
  if (!claims) return c.json({ error: "Not authenticated" }, 401);
  return next();
});

storageRoutes.post("/object/:bucket/*", async (c) => {
  const bucket = c.req.param("bucket");
  const objectPath = decodeURIComponent(c.req.path.split(`/object/${bucket}/`)[1] ?? "");
  const full = resolveObject(bucket, objectPath);
  if (!full) return c.json({ error: `Invalid storage path: ${bucket}/${objectPath}` }, 400);

  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > env.maxUploadBytes) return c.json({ error: "File too large" }, 413);
  const buf = Buffer.from(await c.req.arrayBuffer());
  if (buf.length > env.maxUploadBytes) return c.json({ error: "File too large" }, 413);

  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return c.json({ Key: `${bucket}/${objectPath}`, path: objectPath });
});

storageRoutes.delete("/object/:bucket", async (c) => {
  const bucket = c.req.param("bucket");
  const body = await c.req.json().catch(() => null);
  const prefixes: unknown[] = Array.isArray(body?.prefixes) ? body.prefixes : [];
  for (const p of prefixes) {
    const full = typeof p === "string" ? resolveObject(bucket, p) : null;
    if (!full) return c.json({ error: `Invalid storage path: ${bucket}/${String(p)}` }, 400);
    await rm(full, { force: true });
  }
  return c.json(prefixes.map((p) => ({ name: p })));
});
