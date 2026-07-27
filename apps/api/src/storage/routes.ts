import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Client as MinioClient } from 'minio';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireAuth, requireRole, HttpError } from '../auth/middleware.ts';
import { translateDbError } from '../errors.ts';

/**
 * Photo upload, per ADR-0006.
 *
 * Two steps, because the bytes never pass through the API:
 *
 *   1. `POST /v1/media/upload-url` mints a presigned PUT. The key is chosen by the
 *      server, never the client: `<userId>/<uuid>.<ext>`.
 *   2. The client PUTs straight to MinIO, then calls `POST /v1/media/complete`, which
 *      **inspects the stored object** before recording it.
 *
 * Step 2 verifies rather than trusts. A presigned PUT cannot enforce a size limit — only
 * the POST-policy form can — so a client holding a URL for a small jpeg could upload a
 * 50 MB file or something that is not an image at all. Checking the object afterwards
 * and deleting it when it fails is what actually enforces the limits.
 *
 * The key prefix is belt and braces: the media_insert policy independently requires
 * `storage_path LIKE auth.uid() || '/%'`, so even a wrong key here cannot be recorded
 * against another member.
 */

const uuid = z.string().uuid('Ongeldige verwijzing.');

/** Mirrors app_settings.upload_limits; the database remains the source of truth. */
const EXT_FOR: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const BUCKET = 'media';
/** Short-lived: a presigned URL is a bearer capability. */
const PRESIGN_SECONDS = 300;

export function registerStorageRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null) =>
    withRls(config.DATABASE_URL, claims, fn);
  const moderator = requireRole('moderator', 'admin', 'super_admin');

  const endpoint = new URL(config.MINIO_ENDPOINT);
  const minio = new MinioClient({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port) || (endpoint.protocol === 'https:' ? 443 : 80),
    useSSL: endpoint.protocol === 'https:',
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
  });

  /** Limits read from app_settings, so changing them needs no deploy. */
  async function limits(claims: Claims | null) {
    return db(async (tx) => {
      const { rows } = await tx.query<{ value: { max_bytes: number; allowed_types: string[] } }>(
        `select value from public.app_settings where key = 'upload_limits'`,
      );
      return rows[0]?.value ?? { max_bytes: 5_242_880, allowed_types: Object.keys(EXT_FOR) };
    }, claims);
  }

  // ---------------------------------------------------------------- presign
  app.post('/v1/media/upload-url', { preHandler: requireAuth }, async (req) => {
    const body = z
      .object({
        content_type: z.string().max(64),
        /** Client-reported; verified for real on completion. */
        size_bytes: z.number().int().positive().optional(),
      })
      .parse(req.body);

    const userId = req.claims?.sub;
    if (!userId) throw new HttpError(401, 'Log in om een foto te delen.');

    const rules = await limits(req.claims);
    if (!rules.allowed_types.includes(body.content_type)) {
      throw new HttpError(400, 'Alleen JPEG, PNG en WebP zijn toegestaan.');
    }
    if (body.size_bytes && body.size_bytes > rules.max_bytes) {
      throw new HttpError(
        400,
        `De foto is te groot (max ${Math.round(rules.max_bytes / 1024 / 1024)} MB).`,
      );
    }

    // The server picks the key. A UUID makes it unguessable, which matters because the
    // media bucket is publicly readable — approval gates discovery, not access.
    const key = `${userId}/${randomUUID()}.${EXT_FOR[body.content_type]}`;
    const url = await minio.presignedPutObject(BUCKET, key, PRESIGN_SECONDS);

    return { upload_url: url, storage_path: key, expires_in: PRESIGN_SECONDS };
  });

  // ---------------------------------------------------------------- complete
  app.post('/v1/media/complete', { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        storage_path: z.string().min(3).max(300),
        caption: z.string().trim().max(300).nullable().optional(),
      })
      .parse(req.body);

    const userId = req.claims?.sub;
    if (!userId) throw new HttpError(401, 'Log in om een foto te delen.');

    // Reject a key belonging to someone else before touching storage at all.
    if (!body.storage_path.startsWith(`${userId}/`)) {
      throw new HttpError(403, 'Deze upload hoort niet bij jouw account.');
    }

    const rules = await limits(req.claims);

    // Inspect what was actually stored. This is the real enforcement point.
    let stat;
    try {
      stat = await minio.statObject(BUCKET, body.storage_path);
    } catch {
      throw new HttpError(404, 'De foto is niet geüpload. Probeer het opnieuw.');
    }

    const contentType = stat.metaData?.['content-type'] ?? '';
    const tooBig = stat.size > rules.max_bytes;
    const wrongType = !rules.allowed_types.includes(contentType);

    if (tooBig || wrongType) {
      // Remove it: an object nobody may reference is litter, and leaving it lets a
      // client fill the bucket with rejected files.
      await minio.removeObject(BUCKET, body.storage_path).catch(() => undefined);
      throw new HttpError(
        400,
        tooBig
          ? `De foto is te groot (max ${Math.round(rules.max_bytes / 1024 / 1024)} MB).`
          : 'Alleen JPEG, PNG en WebP zijn toegestaan.',
      );
    }

    const created = await db(async (tx) => {
      // moderation_status is forced to 'pending' for anonymous uploaders by
      // trg_moderation_default; rate limiting fires as a trigger too.
      const { rows } = await tx.query(
        `insert into public.media_uploads (uploader_id, storage_path, caption)
         values (auth.uid(), $1, $2)
         returning id, moderation_status`,
        [body.storage_path, body.caption ?? null],
      );
      return rows[0];
    }, req.claims).catch(async (err) => {
      // The row was refused, so the object has no owner. Clean it up rather than
      // leaving an orphan in the bucket.
      await minio.removeObject(BUCKET, body.storage_path).catch(() => undefined);
      return translateDbError(err);
    });

    reply.status(201);
    return created;
  });

  // ---------------------------------------------------------------- read
  app.get('/v1/media', async (req) =>
    db(async (tx) => {
      // RLS returns approved photos, plus the caller's own pending ones.
      const { rows } = await tx.query(
        `select m.id, m.storage_path, m.caption, m.moderation_status, m.created_at,
                p.display_name as uploader_name
           from public.media_uploads m
           left join public.v_profiles_public p on p.id = m.uploader_id
          order by m.created_at desc
          limit 100`,
      );
      return {
        items: rows.map((r) => ({
          ...r,
          url: `${config.MINIO_PUBLIC_URL}/${BUCKET}/${r.storage_path}`,
        })),
      };
    }, req.claims).catch(translateDbError),
  );

  // ---------------------------------------------------------------- delete
  app.delete('/v1/media/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);

    const removed = await db(async (tx) => {
      // RLS decides whether this caller owns it or moderates. A returned row means the
      // delete was permitted.
      const { rows } = await tx.query<{ storage_path: string }>(
        'delete from public.media_uploads where id = $1 returning storage_path',
        [id],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    if (!removed) throw new HttpError(404, 'Foto niet gevonden.');

    // Storage after the database: if this fails the row is already gone, and an orphaned
    // object is recoverable. The reverse would leave a row pointing at nothing.
    await minio.removeObject(BUCKET, removed.storage_path).catch(() => undefined);

    reply.status(204);
    return null;
  });

  // Moderators reject a photo through the shared moderation endpoint; this only removes
  // the bytes once a rejection is final.
  app.post('/v1/media/:id/purge', { preHandler: moderator }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);

    const row = await db(async (tx) => {
      const { rows } = await tx.query<{ storage_path: string; moderation_status: string }>(
        'select storage_path, moderation_status from public.media_uploads where id = $1',
        [id],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    if (!row) throw new HttpError(404, 'Foto niet gevonden.');
    if (row.moderation_status !== 'rejected') {
      throw new HttpError(409, 'Alleen afgewezen foto’s kunnen worden verwijderd.');
    }

    await minio.removeObject(BUCKET, row.storage_path).catch(() => undefined);
    return { ok: true };
  });
}
