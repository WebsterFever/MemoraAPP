# ADR-008: BullMQ + Redis for Asynchronous Processing, with a Durable Job Ledger

## Status
Accepted

## Context
The audio/memory pipeline has many sequential, potentially slow, externally
rate-limited stages (transcription, extraction, embedding) that must not
block the API request path, must be retryable per-stage, and must not
silently lose track of a stuck job.

## Decision
Use BullMQ on Redis, with one queue per pipeline stage
(`06-audio-pipeline-jobs-storage.md` §2), exponential-backoff retries, and a
durable `ProcessingJob` table in Postgres that mirrors job lifecycle state —
because Redis-held queue state is not an acceptable system of record for
"what happened to this specific memory," given it can be lost or rotated
and is opaque to normal SQL-based admin tooling.

## Alternatives considered
- **A single monolithic "process memory" job** — rejected: couples the
  retry/scaling characteristics of fast stages (embedding) to slow,
  externally rate-limited stages (transcription), and forces a full
  re-run (and re-billing) of every stage on any failure.
- **Relying solely on BullMQ's own job records for status** — rejected:
  acceptable for operational queue management, but not sufficient as the
  user-facing/admin-facing "why is this memory stuck" record, which needs
  to survive Redis maintenance/eviction and be queryable via normal SQL
  alongside the rest of the domain data.

## Consequences
- Slightly more bookkeeping (writing `ProcessingJob` rows alongside BullMQ's
  own state) in exchange for durable, SQL-queryable pipeline observability
  from day one — directly useful for the admin dashboard's "processing
  failures" view (design target, per the brief) without extra work later.
- Per-stage queues let worker concurrency be tuned per external provider's
  actual rate limits, rather than one global concurrency setting.
