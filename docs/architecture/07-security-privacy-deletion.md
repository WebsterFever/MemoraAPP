# Security, Privacy, and Deletion Architecture

## 1. Security architecture (summary — see `01-diagrams.md` Diagram D)

- **Transport**: TLS everywhere; no plaintext HTTP path, including
  internal service-to-service calls where feasible.
- **AuthN**: short-lived access JWT (minutes) + refresh-token rotation.
  Refresh tokens are stored **hashed**; each refresh exchange issues a new
  token and invalidates the old one; **reuse of an already-rotated token is
  treated as theft** and revokes the entire token family, forcing
  re-login — this is the standard mitigation for stolen-refresh-token replay
  and satisfies the mandatory test case "refresh token rotation works."
- **AuthZ**: server-side only, resolved through Family → FamilyMembership →
  MemoryProfilePermission → ConsentRecord, as detailed in doc 03. The mobile
  app may hide UI affordances for clarity, but every mutating/reading
  endpoint independently re-checks authorization — the brief's rule
  "never depend solely on frontend visibility" is enforced by NestJS guards
  on every route, not by convention.
- **Rate limiting**: applied per-IP and per-account, with tighter limits on
  `/auth/*` (brute-force mitigation), AI endpoints (cost control), and
  upload endpoints (abuse control).
- **Input validation**: `class-validator`/`class-transformer` DTOs at every
  controller boundary; no raw `req.body` access. LLM-produced structured
  output is validated again, separately, with Zod (doc 04 §7) — these are
  two different trust boundaries (client input vs. model output) and both
  are validated, not just one.
- **Secrets management**: provider API keys live only in the backend's
  secret manager / environment configuration, never in the mobile bundle,
  never committed to git (`.env.example` documents required keys with no
  real values). All AI provider calls are proxied through the backend —
  the mobile app never holds an OpenAI/Anthropic/etc. key.
- **Audit logging**: append-only `AuditLog` for authentication events,
  permission/role changes, consent changes, and all deletion lifecycle
  transitions.

## 2. Cross-family isolation & vector-search authorization (defense in depth)

This is the single most important security property in the system — a
failure here means one family reading another family's private memories.
Two independent layers:

**Layer 1 — Application layer.** All memory/chunk/conversation queries route
through repository methods that require an explicit authorized-profile-ID
set as a parameter (not an optional filter). This set is computed once per
request by `PermissionsModule` from the authenticated user's family
memberships and profile permissions (doc 03 §2–3). Code review convention
and lint rules flag any direct Prisma/SQL query against `MemoryChunk` or
`Memory` outside these repository methods.

**Layer 2 — Database layer (Postgres Row-Level Security).** Independent of
application code correctness, RLS policies on `Memory`, `MemoryChunk`,
`MemorySource`, `Conversation`, and `Message` restrict visible rows to a
`current_setting('app.authorized_profile_ids')` session variable set at the
start of every request-scoped database transaction. If an application bug
ever forgot the Layer 1 filter, Layer 2 still prevents cross-family data
from being returned. This is deliberately redundant — for data this
sensitive, a single point of failure in authorization logic is not an
acceptable risk.

Both layers are covered by the mandatory test suite: "user cannot access
another family's memories" and "vector retrieval respects family/profile
authorization" (doc 10) run against the API with two distinct families
seeded, asserting zero cross-family leakage at the HTTP response level.

## 3. Memory deletion workflow (tombstone-first)

```
DELETE /memories/:id
  → AuthZ check (role permits deletion of this memory)
  → confirmation summary shown to user (what will be removed)
  → user confirms
  → SYNCHRONOUS transaction: Memory.status = DELETED, deletedAt = now()
  → this tombstone is checked by BOTH authorization layers (§2) immediately
  → 202 Accepted returned to client
  → ASYNC (BullMQ, high priority): physical cleanup
      - delete MemoryChunk rows (embeddings gone from index)
      - delete MediaAsset from object storage
      - delete/invalidate MemoryTranslation rows
      - invalidate any cached representations
      - MessageCitation rows referencing this memory become
        non-resolving (citation endpoint returns "source no longer
        available" rather than erroring or, worse, silently serving
        stale content)
  → DeletionRequest.status = COMPLETED
  → AuditLog(MEMORY_DELETED)
```

The critical property: **the gap between "user clicked delete" and "physical
bytes are gone" can be seconds to minutes, but the gap between "user clicked
delete" and "unsearchable/unretrievable" is zero** — the tombstone flip and
the authorization check are the same mechanism, so there is no window where
a deleted memory can surface in a RAG answer. This satisfies the mandatory
test case "deleted memory cannot be retrieved" and product rule #17.

## 4. Memory Profile deletion workflow

Higher blast radius, therefore stronger gating:

```
POST /profiles/:id/delete-request
  → return impact summary (memory count, recording count, photo count, etc.)
POST /profiles/:id/delete-request/confirm  {password}
  → STEP-UP reauthentication required (doc 03 §6)
  → DeletionRequest{targetType: PROFILE, status: CONFIRMED} created
  → MemoryProfile.status = DELETION_PENDING   (immediately blocks retrieval —
     the authorization-filter step in doc 04 §3 excludes any profile not in
     ACTIVE/CLAIMED status)
  → AuditLog(PROFILE_DELETION_REQUESTED)
  → 202 Accepted
ASYNC job graph (high priority queue):
  → tombstone/cascade-delete all Memories, MemoryChunks, Conversations,
    Messages, MessageCitations under this profile
  → delete all MediaAssets from object storage
  → delete embeddings / search index entries
  → delete InterviewSession/Question/Answer, MemoryCoverage rows
  → verify deletion (a completion check step re-queries to confirm zero
    remaining rows before marking done — cheap and catches partial failures)
  → MemoryProfile.status = DELETED
  → DeletionRequest.status = COMPLETED
  → AuditLog(PROFILE_DELETION_COMPLETED)
```

The explicit "verify deletion" step exists because a silent partial failure
(e.g., one MediaAsset delete call fails) must not result in a profile marked
`DELETED` while data actually remains — the job graph re-checks before
declaring success and retries any incomplete branch.

## 5. Account deletion workflow

Deliberately separate from profile deletion (doc 03 §1, product rule #34):

```
POST /account/delete-request/confirm  {password}   (step-up required)
  → check: does this user SOLELY own (as Family OWNER with no other
    OWNER/ADMIN) any Family that contains ACTIVE MemoryProfiles with other
    contributors/viewers depending on it?
  → if yes: block deletion, require the user to first transfer Family
    ownership or explicitly delete/orphan-resolve those profiles
  → if no: proceed
      - User.status = DELETION_PENDING (blocks login immediately)
      - revoke all RefreshTokens
      - AccountDeletion job: anonymize/delete PII (email, displayName),
        remove FamilyMemberships, leave AuditLog entries intact but
        re-keyed to a stable anonymized actor reference (audit history
        must survive the actor's account deletion for compliance/forensics)
      - DeletionRequest.status = COMPLETED
      - AuditLog(ACCOUNT_DELETION_COMPLETED)
```

This guarantees deleting Webster's account can never silently destroy Mom's
memories if Mom (or a sibling) also depends on that family — ownership must
be resolved first, exactly as product rule #34 requires.

## 6. Data export

- Export is a **consent-gated, step-up-authenticated** async job (same
  pattern as deletion): `POST /profiles/:id/export-request` → step-up →
  `DeletionRequest`-style tracking record (or a parallel `ExportRequest` if
  export gains enough distinct fields later) → background job assembles a
  package (original media + transcripts + structured memory metadata,
  clearly separated from AI-derived content) → a short-lived signed download
  link is issued, not an email attachment of raw sensitive data.
- Export respects the same authorization boundary as everything else: a
  Family OWNER can export what they're permitted to see, not automatically
  everything in the family (a VIEWER-only profile a different member locked
  down stays locked down).
- `ConsentRecord{type: EXPORT}` governs whether a *profile's* content is
  exportable at all, independent of who is doing the exporting — the
  profile's subject (once claimed) controls this, consistent with doc 03 §4.

## 7. Privacy model summary

| Principle | Mechanism |
|---|---|
| Data minimization | Only explicitly-provided biographical fields are stored; no inferred sensitive attributes |
| Purpose limitation | AI conversation, voice synthesis, sharing, export, and post-mortem access are independently consentable — enabling one doesn't imply the others |
| Right to erasure | Tombstone-first deletion workflows (§3–5), immediate unretrievability |
| Right to portability | Signed-URL export packages (§6) |
| Storage limitation | Deletion removes derived data (embeddings, translations, summaries) alongside originals — nothing derived outlives its source's deletion |
| Least privilege | Two-layer RBAC (family + profile level, doc 03) plus RLS (§2) |
| Auditability | Append-only `AuditLog` for every sensitive state transition |
| Third-party mention transparency | AI framing always attributes claims to "memories preserved by X," never presented as verified fact about named third parties |
| Biometric-grade handling for voice | Voice consent modeled distinctly from generic media consent (doc 05 §4), gated end-to-end |
