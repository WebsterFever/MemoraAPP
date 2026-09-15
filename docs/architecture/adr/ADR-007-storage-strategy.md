# ADR-007: S3-Compatible Object Storage with Signed URLs Only

## Status
Accepted (concrete provider open — see Consequences)

## Context
Original audio, photos, videos, and documents are large binary assets that
must never be publicly reachable by a guessable URL, must remain accessible
only to authorized users, and must become immediately unreachable when a
memory/profile is deleted or consent is revoked — while the API itself
should not proxy media bytes (to stay stateless and scale independently of
storage throughput).

## Decision
Use an S3-compatible object store. All uploads and downloads go through
short-lived, single-object **signed URLs** issued by the API after an
authorization check (`06-audio-pipeline-jobs-storage.md` §3). No media is
ever served from a permanent or public URL.

## Alternatives considered
- **Storing media in Postgres (bytea/large objects)** — rejected: wrong tool
  for large binary media at scale, bloats database backups, and gains
  nothing over object storage plus a metadata row.
- **Proxying all media through the API** — rejected: needlessly couples API
  compute/bandwidth scaling to media throughput; signed URLs let the client
  talk to storage directly while the API remains the sole authorization
  checkpoint.

## Consequences
- The exact provider (AWS S3, Cloudflare R2, Supabase Storage, etc.) is
  still open (executive summary §7, item 4) — the signed-URL contract is
  provider-agnostic, so this choice is primarily a cost/ops decision, not
  an architecture one, and can be swapped behind `MediaModule` if needed.
- Every deletion/consent-revocation workflow must ensure no valid signed URL
  can be issued post-tombstone (`07-security-privacy-deletion.md` §3–4) —
  this is a check on the *issuance* endpoint, not on the storage provider,
  so it holds regardless of which provider is chosen.
