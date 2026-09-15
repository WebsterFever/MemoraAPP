# Memora — Phase 0 Architecture: Executive Summary

## 1. What we are building

Memora is a private, multi-tenant "family memory" platform. A **User Account**
(a real, authenticated person) creates one or more **Memory Profiles**
(the person *whose* memories are being preserved — who may or may not be the
same human as the account holder). Memories are captured as audio, text,
photo, video, or via an AI-guided interview, and are pushed through an
asynchronous pipeline (transcription → segmentation → structured extraction →
embeddings) into a searchable, citation-backed knowledge base. Authorized
family members later query that knowledge base conversationally through a
grounded RAG system that refuses to answer when evidence is missing, and
offers to route the question back to the memory owner ("Ask Them Later").

Two independent AI subsystems exist and must never be merged:

- **Memory Builder AI** — helps a person *create* memories (guided interview,
  adaptive questioning, coverage tracking).
- **Memory Conversation AI** — helps authorized family *explore* memories
  that already exist (RAG, citations, source playback).

Full detail lives in the linked documents below. This file is the map.

| Document | Contents |
|---|---|
| [01-diagrams.md](01-diagrams.md) | System architecture, RAG pipeline, audio pipeline, security architecture, 14 user-flow diagrams (A–N) |
| [02-domain-model.md](02-domain-model.md) | Bounded contexts, entity justification, ERD, pgvector strategy |
| [03-identity-and-permissions.md](03-identity-and-permissions.md) | User vs. Profile, Family, RBAC, invitations, profile claiming, step-up auth, consent |
| [04-ai-architecture.md](04-ai-architecture.md) | RAG pipeline, orchestration (LangChain/LangGraph), prompt versioning, structured outputs, citations, evaluation, Langfuse |
| [05-multilingual-multimodal-voice.md](05-multilingual-multimodal-voice.md) | Cross-lingual retrieval, language detection, photo/video memories, voice abstraction + consent |
| [06-audio-pipeline-jobs-storage.md](06-audio-pipeline-jobs-storage.md) | BullMQ job graph, storage/signed-URL strategy |
| [07-security-privacy-deletion.md](07-security-privacy-deletion.md) | Cross-family isolation, vector-search authorization, deletion workflows, audit, export |
| [08-backend-architecture.md](08-backend-architecture.md) | NestJS module map, clean-architecture layering |
| [09-mobile-architecture.md](09-mobile-architecture.md) | React Native feature structure, state boundaries, design system |
| [10-testing-cicd-devex.md](10-testing-cicd-devex.md) | Test matrix, CI/CD, scalability, local dev experience |
| [adr/](adr/) | ADR-001 through ADR-010 |

## 2. MVP scope (Phases 1–8 of the roadmap)

**In scope for MVP:**
- Email/password auth with refresh-token rotation, rate limiting.
- Family + FamilyMembership + FamilyInvitation (RBAC roles enforced server-side).
- Memory Profile creation, profile-level permissions, profile claiming.
- Text and audio memory capture (photo capture can land in MVP if time allows;
  video is explicitly Phase 11).
- Async audio pipeline: upload → transcription → cleanup → segmentation →
  extraction → embeddings → pgvector storage.
- Hybrid RAG (vector + keyword) with authorization filtering, grounded answers,
  mandatory citations, confidence-gated refusal ("I couldn't find...").
- Chat-style mobile UX for Memory Conversation AI.
- Basic guided interview (static + coverage-aware question selection) for
  Memory Builder AI — full adaptive AI-generated follow-ups can start simple
  (template-driven) and get smarter in Phase 9.
- Family Question Queue ("Ask Them Later") — this is a core loop, not a
  nice-to-have, and is included in MVP.
- AIExecution metrics + cost tracking abstraction (even if Langfuse UI wiring
  completes in Phase 10, the data model must exist from day one so nothing is
  backfilled).
- Basic audit log for auth events, permission changes, and deletions.

**Explicitly postponed after MVP:**
| Feature | Target phase | Why postponed |
|---|---|---|
| Video memories | 11 | Larger storage/processing cost; photo covers multimodal proof-of-concept first |
| Voice synthesis / cloned voice | 12 | Requires consent infrastructure + provider evaluation; must not block core product |
| Real-time voice conversation ("talk mode") | Post-13, design only | Latency/cost heavy; must not compromise grounding — needs the RAG pipeline proven first |
| Family graph visualization UI | 13 | Data model exists from MVP (Person/Relationship), visualization is additive |
| Timeline UI | 13 | Data model (dateCertainty) exists from MVP; dedicated screen later |
| Full LangGraph multi-agent specialization (Recipe/Timeline/Relationship agents) | 9 | MVP ships a single grounded-answer path; specialize only where measurable value appears |
| Langfuse dashboards / eval loops in UI | 10 | Traces are emitted from MVP; analysis tooling comes later |
| Subscriptions/entitlements enforcement | 15 | Quota *fields* exist in schema from MVP; billing provider integration deferred |
| Admin web dashboard | Ongoing, design in Phase 0 only | No implementation until core product stabilizes |
| Notifications (push) | 14 | "Ask Them Later" works via in-app queue first; push is a UX upgrade |

## 3. Major technical risks

1. **Cross-lingual retrieval quality.** Multilingual embedding models vary in
   quality for Haitian Creole specifically (a low-resource language). Mitigate
   by combining vector search with keyword search against machine-translated
   text (hybrid retrieval), and by evaluating candidate embedding models
   empirically before committing (see open questions).
2. **Hallucination under low-resource retrieval.** If Creole embeddings are
   weak, similarity scores will be noisy, and the confidence threshold that
   gates "refuse to answer" needs careful tuning per language — a single global
   threshold risks either over-refusing or hallucinating. Mitigate with
   per-language threshold calibration data captured via the Evaluation Agent.
3. **Vector-search authorization bugs are catastrophic here** — a leak would
   expose one family's private memories to another. Mitigate with defense in
   depth: repository-layer mandatory filters + Postgres Row-Level Security as
   a second, independent enforcement layer (see ADR-002, doc 07).
4. **Async pipeline complexity.** Many sequential BullMQ stages (transcribe →
   clean → segment → extract → embed) means many partial-failure states.
   Mitigate with a `ProcessingJob` tracking table (not just ephemeral queue
   state), idempotent stage handlers, and per-stage retry/backoff.
5. **Cost runaway from LLM calls.** Guided interviews, extraction, embeddings,
   RAG generation, and evaluation all call paid APIs. Mitigate with the
   `AIExecution` ledger + per-family/plan quotas designed from day one (even
   if unenforced until Phase 15), and by using small/cheap models for
   classification and reranking, reserving larger models for final generation.
6. **Deletion correctness.** "Deleted must mean immediately unsearchable" is a
   hard real-time constraint layered on top of a fully async architecture.
   Mitigate with tombstoning at the row level (checked in every retrieval
   query) decoupled from physical cleanup (background job) — see doc 07.
7. **Consent/voice legal exposure.** Voice cloning without airtight consent is
   both an ethical and legal risk. Mitigate by gating the entire voice-
   synthesis code path behind a consent record that must be `GRANTED` and by
   defaulting to "unavailable" rather than "on" when ambiguous.

## 4. Estimated AI cost drivers

Ranked by expected cost contribution at moderate scale (roughly one active
family recording ~2 memories/week and asking ~10 questions/week):

1. **Audio transcription** (per-minute pricing) — dominant cost driver early
   on, since a single guided interview session can run 20–40 minutes.
2. **Embedding generation** — cheap per call, but scales with chunk count;
   negligible individually, add up with large families.
3. **Grounded answer generation (RAG)** — a few hundred to ~1–2k tokens per
   turn including context; cost scales with number of questions asked, not
   memories stored.
4. **Memory extraction (structured output)** — one call per memory/segment;
   moderate cost, can use a cheaper model tier than conversational generation.
5. **Evaluation Agent** — one extra LLM call per generated answer; can be
   sampled (e.g., evaluate 100% in beta, sample a percentage at scale) rather
   than run unconditionally forever.
6. **Voice synthesis** (once enabled) — typically priced per character; will
   become significant only after Phase 12, and only for families that enable it.

Design implication: the pricing abstraction (see `04-ai-architecture.md` §7)
must let us swap models per operation independently — e.g., cheap model for
intent classification and reranking, stronger model only for final grounded
generation — without code changes elsewhere.

## 5. Privacy risks

- **Highly sensitive content by design** — this is intimate biographical and
  family data, often about deceased or vulnerable people. A breach is not
  "inconvenient," it's an intrusion into private grief and identity.
- **Voice is biometric data** in many jurisdictions (e.g., BIPA-style laws,
  GDPR special category treatment in some readings) — synthesis and storage
  of voice must be treated with the same rigor as biometric data, not as a
  generic media asset.
- **Minors and third parties mentioned in memories** — a memory can reference
  people who never consented to being described (e.g., "my sister did X").
  Memora cannot get consent from every named third party; the mitigation is
  transparency (this is one person's recollection, not a verified public
  record) plus the explicit anti-hallucination rule that the AI never invents
  facts about third parties beyond what was stated.
- **Post-mortem access** is an explicit consent dimension (`POST_MORTEM_ACCESS`
  in `ConsentRecord`) precisely because grief-stage data access decisions are
  ethically loaded and must be decided in advance by the person, not
  retroactively by survivors.
- **Observability leakage** — Langfuse traces must not carry raw private
  transcript content by default; see doc 04 §8 for the redaction policy.

## 6. Scenario validation (end-to-end walkthrough)

This walks the exact scenario from the brief through the architecture to
confirm nothing is missing before Phase 1 begins.

1. **Webster registers** → `User` row created, password Argon2id-hashed,
   access+refresh JWT pair issued (doc 03).
2. **Webster creates a Family** (implicit on first profile, or explicit) and a
   **Memory Profile for Mom** → `MemoryProfile{familyId, createdByUserId:webster, status:ACTIVE}`.
3. **Mom is invited** as Memory Owner/Contributor → `FamilyInvitation` issued,
   Mom accepts, gets a `FamilyMembership`, and can submit a
   `MemoryProfileClaim` on the Mom profile → once verified, `MemoryProfile.claimedByUserId = mom` and she gains independent consent control (doc 03 §4).
4. **Mom sets preferredLanguage = ht (Haitian Creole)** on her profile — this
   only seeds UI/interview defaults, it never restricts recording language
   (doc 05 §1).
5. **Mom starts a guided interview** → `InterviewSession` created, questions
   served in Creole by the Memory Builder AI (doc 04 §2), adapting based on
   `MemoryCoverage` gaps.
6. **Mom answers in Creole, sometimes French** → each answer is an audio
   `MemorySource`; language is detected **per source** (not fixed to profile
   preference), original audio is preserved permanently, and transcription +
   translation both occur (doc 05 §1–2, doc 06).
7. **Segmentation → extraction → embeddings** → `Memory` + `MemoryChunk` rows
   created with a multilingual embedding computed on the **original-language**
   text; `MemoryTranslation` rows store English/French renderings separately
   without ever overwriting the original transcript (doc 02, doc 05).
8. **Webster asks in English**, "How did Mom learn to make soup joumou?" →
   Memory Conversation AI: intent classified as `RECIPE`, query embedded with
   the same multilingual model, hybrid retrieval runs vector search (cross-
   lingual, matches the Creole chunk directly) + keyword search against
   `MemoryTranslation` text, authorization filter restricts to profiles
   Webster can access in that family, reranking picks the best chunk(s), and
   grounded generation answers in English **citing** the specific
   `MemoryChunk`/`MemorySource` (doc 04 §3–5).
9. **Webster taps "Listen to source"** → mobile fetches a short-lived signed
   URL for the original audio and seeks to `MemoryChunk.startTimestamp` (doc 06 §3).
10. **Authorized synthetic voice (if enabled)** → only reachable if
    `ConsentRecord{type:VOICE_SYNTHESIS, status:GRANTED}` exists for Mom's
    profile; otherwise the app transparently falls back to original audio
    clips only, and the UI never implies synthesis when it hasn't happened
    (doc 05 §4).
11. **Webster asks "What was Grandpa's first job?"** → retrieval returns no
    chunk above the similarity/rerank confidence threshold → the
    `GroundedResponseAgent` is never invoked with fabricated content; instead
    a refusal response is returned with a suggested action, `ASK_PROFILE_OWNER`
    (doc 04 §6).
12. **Webster selects "Ask Mom"** → `FamilyMemoryQuestion{status:WAITING_FOR_ANSWER}`
    created, Mom notified (in-app in MVP, push in Phase 14) (doc 02, doc 04 §6).
13. **Mom records an answer** → goes through the *same* memory pipeline as
    step 6–7, is linked back to the `FamilyMemoryQuestion` (now `ANSWERED`),
    and becomes retrievable immediately after processing completes.
14. **Webster asks again later** → the new memory is now part of the index and
    can ground the answer.
15. **Mom revokes AI/sharing consent, or an owner deletes a memory** →
    tombstone flag flips synchronously inside the same transaction that
    authorizes the request; the retrieval authorization filter checks this
    flag on every query (not a cache), so the memory/profile is
    **immediately** excluded from RAG results regardless of whether the
    background physical-cleanup job has run yet (doc 07 §2–4).

Every step maps to a concrete component with no gaps — Phase 1 can proceed.

## 7. Open questions that must be decided before Phase 1

These are genuine product/infra decisions, not implementation details. Each
has a recommended default (see linked ADR), but you should explicitly confirm
or override before we generate any code:

1. **LLM provider for text generation/extraction/evaluation** — OpenAI, or
   Anthropic Claude, or both behind the provider abstraction? Affects API key
   provisioning and the ModelProvider adapter list (ADR-005).
2. **Embedding model** — OpenAI `text-embedding-3-large`, Cohere
   `embed-multilingual-v3`, or a self-hosted multilingual model — this
   directly affects Haitian Creole retrieval quality, a core product claim
   (ADR-009).
3. **Transcription/TTS provider** — brief specifies "OpenAI-supported APIs"
   for voice; confirm this is acceptable for Haitian Creole transcription
   quality specifically, since Whisper's Creole support is imperfect (doc 05 §5).
4. **Object storage provider** — S3, Cloudflare R2, or Supabase Storage —
   affects signed-URL implementation and cost model (ADR-007).
5. **Hosting for Postgres+pgvector** — managed (Supabase/Neon/RDS) vs.
   self-hosted — affects how quickly Phase 1's Docker Compose maps to
   production (ADR-002).
6. **Monorepo tooling** — pnpm workspaces + Turborepo vs. Nx (ADR-001).
7. **Push notification provider** — deferred to Phase 14, but worth naming
   early (Expo push, Firebase) since it affects mobile SDK choices later.
8. **MFA/passkey scope for step-up auth** — is password-only step-up
   acceptable for MVP, with MFA/passkey added later, or is MFA required from
   day one given the sensitivity of the data (doc 03 §5)?
9. **Data residency / compliance target** — is there a specific target market
   (US, EU, Haiti/Caribbean diaspora) that implies GDPR-style obligations from
   day one, given family data spans multiple countries?
10. **Langfuse hosting** — Langfuse Cloud vs. self-hosted — affects whether any
    trace data (even redacted) leaves your infrastructure (doc 04 §8).

Recommended defaults for all ten are stated in the relevant ADRs so we are not
blocked; flag any of them now if you want a different default before Phase 1.
