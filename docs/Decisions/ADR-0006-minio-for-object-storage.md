---
title: ADR-0006 — MinIO for object storage
project: kv-eendracht
status: accepted
date: 2026-07-25
tags: [adr, storage, minio, s3, uploads, moderation]
updated: 2026-07-25
---

# ADR-0006 — MinIO for object storage

## Status

Accepted, 2026-07-25. Replaces Supabase Storage, removed by
[[ADR-0001-own-api-instead-of-supabase]].

## Context

Three buckets exist in v1, described in
[[KV-EENDRACHT-APP-SPEC#8. Views, RPCs, triggers]]:

| Bucket | Read | Write |
|---|---|---|
| `media` | public | authenticated, not blocked, key must start `auth.uid()/`; 5 MB; jpeg/png/webp |
| `news` | public | admin only |
| `avatars` | public | admin only |

Five `storage.objects` RLS policies enforce this today. The `media` rules matter most: they
are what stops one anonymous community member overwriting another's photo, and they pair with
the moderation queue so uploads are not publicly visible until approved.

Storing images as bytea in Postgres was considered and dismissed — it bloats the database,
makes backups slow, and gives up HTTP caching.

## Decision

**MinIO**, an S3-compatible object store, as a container in the compose stack.

Uploads use presigned PUT URLs rather than proxying bytes through the API:

1. Client asks the API for an upload URL.
2. API authorizes the request, then mints a presigned PUT with the key **forced** to
   `<userId>/<uuid>.<ext>`, a content-type condition, and a 5 MB size condition. The client
   never chooses its own key, which is what preserves the old policy's guarantee.
3. Client PUTs directly to MinIO.
4. Client tells the API the upload finished; the API inserts the `media_uploads` row, which
   starts as `pending` via the existing `trg_moderation_default` trigger.

`media_uploads.storage_path` keeps exactly its current meaning, so no schema change and no
data migration.

## Why MinIO

- **S3 API compatibility** is the real prize. The same client code, presigning logic and
  bucket policies work unchanged against AWS S3, Cloudflare R2, Backblaze B2 or Hetzner
  Object Storage. Since hosting is deliberately undecided, this keeps that door open — the
  storage layer is the one piece that would otherwise pin us to a provider.
- Runs as a single container locally, so development needs no cloud account.
- Mature presigned-URL support with size and content-type conditions, which is precisely the
  mechanism the old storage policies relied on.

## Consequences

**Good**

- Uploads never occupy an API worker; large files go straight to storage.
- One more thing to back up, but a well-understood one — bucket mirroring alongside the
  nightly `pg_dump`, see [[INFRA]].
- Swappable for managed object storage later by changing an endpoint and credentials.

**Bad**

- Presigned URLs are bearer capabilities: anyone holding one can upload until it expires.
  Mitigated by short expiry (5 minutes) and the size and content-type conditions baked into
  the signature.
- Public read of the `media` bucket must be reconciled with moderation. **Approved status
  gates discovery, not access**: an unapproved photo is not listed anywhere in the app, but
  its URL is not itself a secret. Object keys include a UUID so they are unguessable. This
  matches v1's behaviour, where `storage_media_read` was likewise a blanket public read —
  worth recording explicitly rather than assuming it is stricter than it is.
- Content-type must be validated server-side on completion, not trusted from the client.

## Related

- [[ADR-0001-own-api-instead-of-supabase]] · [[INFRA]] · [[API]]
- [[KV-EENDRACHT-APP-SPEC#5. Roles and permissions]] — the anti-abuse controls this supports
