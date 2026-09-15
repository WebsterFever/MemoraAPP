# Audio Pipeline, Queue Strategy, and Storage

## 1. Pipeline stages (detail)

See `01-diagrams.md` Diagram C for the visual. Each stage is a separate
BullMQ job type, chained via `ProcessingJob` state, so a failure at stage 5
doesn't force re-running (and re-billing) stages 1–4.

| # | Stage | Input | Output | Idempotent? |
|---|---|---|---|---|
| 1 | Ingest | Uploaded `MediaAsset` | `MemorySource{status:PROCESSING}` | Yes (upsert by mediaAssetId) |
| 2 | Language detection | Audio | `detectedLanguage` | Yes |
| 3 | Transcription (STT) | Audio + language hint | Raw transcript | Yes (deterministic given same audio) |
| 4 | Transcript cleanup | Raw transcript | Cleaned transcript (disfluencies removed, punctuation restored) — **stored separately from raw**, raw is never discarded | Yes |
| 5 | Semantic segmentation | Cleaned transcript | Segment boundaries (topic/pause/language-switch aware) | Yes |
| 6 | Memory extraction | Segments | Structured `Memory` records (title, summary, people, places, topics, approximateDate, memoryType) — Zod-validated structured output | Yes, but re-running regenerates extraction (versioned, see below) |
| 7 | Metadata / coverage tagging | Extracted memory | `MemoryCoverage` domain tags | Yes |
| 8 | Translation (optional) | Cleaned transcript | `MemoryTranslation` rows | Yes |
| 9 | Embedding generation | Chunk text | Vector per `MemoryChunk` | Yes |
| 10 | Vector storage | Embeddings | pgvector rows, `Memory.status = READY` | Yes |

**Idempotency matters because BullMQ jobs can be retried or, rarely,
double-delivered.** Every stage handler is written to be safe to re-run
against the same input (upsert semantics keyed by `sourceId`/`memoryId`,
not blind inserts) — this is a correctness requirement, not a nice-to-have,
given retries are the primary failure-recovery mechanism (§3).

**Original audio and original-language transcript are never deleted or
overwritten by any later stage** — this is enforced structurally: stages
4–10 only ever *add* new rows/columns, they never have write access to
`MemorySource.transcript` after stage 3 commits (the ORM layer exposes no
update method for that field beyond initial creation).

## 2. Queue design (BullMQ + Redis)

- **One queue per pipeline stage** (`audio.ingest`, `audio.transcribe`,
  `audio.segment`, `memory.extract`, `memory.embed`, ...) rather than one
  monolithic "process audio" job — this lets us scale worker concurrency per
  stage independently (e.g., transcription is the slowest/most
  rate-limited stage and may need more dedicated workers than embedding).
- Each stage's completion enqueues the next stage's job — a simple chain,
  not a separate orchestrator service — using BullMQ's built-in job
  dependencies/flows where that simplifies the chain.
- **Retry policy**: exponential backoff (e.g., 3 attempts: 10s, 60s, 5min),
  after which the job moves to a dead-letter state and
  `Memory.status = FAILED` — surfaced to the memory owner in-app ("This
  memory couldn't be processed, tap to retry") and to a future admin queue
  (`10-testing-cicd-devex.md` references this for the admin dashboard).
  This directly satisfies the mandatory test case: "audio job failure is
  retryable."
- **ProcessingJob table** mirrors job lifecycle in Postgres (durable, queryable) since Redis-held BullMQ state is not the system of record for
  "what happened to this memory" — see `02-domain-model.md` §2 for why this
  exists beyond the brief's original entity list.
- **Deletion jobs** (`06 → 07-security-privacy-deletion.md`) run on their own
  queue (`deletion.*`) with **higher priority** than capture-pipeline jobs —
  a pending deletion should never be delayed behind a backlog of new memory
  processing.
- **Rate-limit awareness**: queues calling external AI providers are
  configured with BullMQ's rate limiter matching the provider's documented
  limits, so we get graceful queuing/backpressure instead of provider-side
  429 storms during a burst (e.g., many family members recording at once).

## 3. Storage strategy

- **Object storage**: S3-compatible (exact provider is an open question —
  see ADR-007) holding original audio, photos, videos, and documents.
  Nothing sensitive is ever served directly from a public bucket URL.
- **Upload path**: mobile requests a short-lived **signed upload URL** from
  the API (`POST /media/upload-url`), uploads directly to object storage
  (keeps large binary payloads off the NestJS API's request path), then
  registers the resulting `MediaAsset` with the API. This keeps the API
  stateless and horizontally scalable — it never proxies media bytes.
- **Download/playback path**: mobile never receives a permanent media URL.
  Every playback request goes through `GET /media/:id/playback-url`, which
  checks authorization (family/profile/consent, same chain as doc 03) and
  returns a **short-lived signed URL** (e.g., 5–15 minutes), scoped to that
  single object. This is what makes "deleted/revoked = immediately
  unreachable" achievable even though the physical object might still exist
  briefly pending cleanup — no valid signed URL will ever be issued for a
  tombstoned resource, regardless of whether the bytes are gone yet.
- **Checksums**: `MediaAsset.checksum` recorded at upload to detect corrupt
  uploads early and support future integrity audits.
- **Retention**: originals are retained for the lifetime of the memory (per
  the "never destroy the original source" rule) and removed only via the
  deletion workflow (`07-security-privacy-deletion.md`), never as a
  storage-cost optimization.
