# Backend (NestJS) Module Architecture

## 1. Layering (clean architecture, applied pragmatically)

Each module internally separates:

```
module/
  domain/           # entities/value objects, pure business rules, no framework deps
  application/       # use-case services, orchestrate domain + ports, no controllers here
  infrastructure/    # Prisma repositories, external provider adapters (implements ports)
  interface/          # controllers, DTOs (class-validator), guards, OpenAPI decorators
```

Rule: `interface/` depends on `application/`, `application/` depends on
`domain/` + abstract ports, `infrastructure/` implements those ports.
Dependency direction never reverses — a controller never talks to Prisma
directly, and a domain service never imports a NestJS decorator. This is
what makes "no business logic inside controllers" (engineering rule #4) and
"separate provider-specific AI code from domain logic" (rule #9) enforceable
rather than aspirational.

## 2. Module map

| Module | Responsibility | Depends on (ports only) |
|---|---|---|
| `AuthModule` | Registration, login, refresh rotation, step-up auth, password policy | `UsersModule` |
| `UsersModule` | User CRUD, account deletion workflow | — |
| `FamiliesModule` | Family, FamilyMembership, FamilyInvitation | `UsersModule` |
| `PermissionsModule` | Central authorization resolution (family role + profile role + consent) — the single place all other modules ask "can this user do X" | `FamiliesModule`, `ProfilesModule`, `ConsentModule` |
| `ProfilesModule` | MemoryProfile, MemoryProfileClaim, MemoryProfilePermission | `FamiliesModule` |
| `ConsentModule` | ConsentRecord lifecycle, audit hooks | `ProfilesModule` |
| `MemoriesModule` | Memory, MemorySource, MemoryTranslation, LifeEvent, Person/Relationship (family graph), Recipe metadata | `ProfilesModule`, `PermissionsModule`, `MediaModule` |
| `MemoryChunkModule` (sub-module of Memories or Search) | MemoryChunk CRUD, embedding storage | `EmbeddingsModule` |
| `MediaModule` | MediaAsset registration, signed upload/download URLs | `PermissionsModule` |
| `AudioModule` | Orchestrates the audio capture → job enqueue path | `MediaModule`, queue producer |
| `TranscriptionModule` | STT provider adapter (behind `VoiceProvider` port), transcript cleanup | — |
| `EmbeddingsModule` | Embedding provider adapter, chunking utilities | — |
| `RagModule` | The RAG pipeline orchestration (LangGraph graph, intent routing, retrieval, generation, citation validation) | `SearchModule`, `AIOrchestratorModule`, `PermissionsModule` |
| `SearchModule` | Hybrid retrieval queries (vector + keyword + fusion) against pgvector/Postgres | `PermissionsModule` (mandatory authz filter) |
| `AIOrchestratorModule` | Prompt version registry, structured-output validation, provider-agnostic chat-model port, AIExecution logging, cost estimation | — |
| `ConversationsModule` / `MessagesModule` | Conversation, Message persistence, citation persistence | `RagModule` |
| `VoiceModule` | VoiceProvider abstraction (transcribe/synthesize/streamSpeech/createAuthorizedVoice), VoiceProfile lifecycle | `ConsentModule` |
| `InterviewModule` | InterviewSession/Question/Answer, MemoryCoverage, adaptive question selection (LangGraph interview graph) | `MemoriesModule`, `AIOrchestratorModule` |
| `FamilyQuestionModule` | FamilyMemoryQuestion ("Ask Them Later") lifecycle | `MemoriesModule`, `NotificationsModule` |
| `NotificationsModule` | In-app notifications (MVP), push abstraction (Phase 14) | — |
| `EvaluationModule` | EvaluationAgent invocation, `Evaluation` persistence, flagging | `AIOrchestratorModule` |
| `ObservabilityModule` | Langfuse tracing integration, redaction policy enforcement | — |
| `BillingModule` | Subscription schema stub, quota fields (no payment provider integration in MVP) | — |
| `AdminModule` | Future admin/dashboard read APIs (design only in Phase 0, no privileged content exposure by default) | Most modules, read-only, restricted |

## 3. Why `PermissionsModule` is its own module

Authorization logic (doc 03) is deliberately centralized rather than
duplicated inside `MemoriesModule`, `ConversationsModule`, etc. Every module
that touches profile-scoped data calls
`PermissionsModule.resolveAuthorizedProfileIds(userId, familyId)` or
`PermissionsModule.assertCanAccessProfile(userId, profileId, action)` —
this is the single choke point that both the application-layer filter and
the Postgres session-variable setup (doc 07 §2) originate from. Duplicating
this logic per module is exactly the kind of bug surface that leads to
cross-family data leaks.

## 4. Why `AIOrchestratorModule` is separate from `RagModule` and `InterviewModule`

`AIOrchestratorModule` owns everything **provider-specific and
cross-cutting**: which chat model is active, prompt version resolution,
Zod validation + repair-retry logic, `AIExecution` logging, and cost
estimation (doc 04 §7–9). `RagModule` and `InterviewModule` are **consumers**
of it — they define *what* graphs/prompts to run, never *how* a provider
call is made, retried, validated, or priced. This is the concrete
implementation of engineering rule #9 ("separate provider-specific AI code
from domain logic") and is what makes ADR-005's provider swap possible
without touching either the RAG or interview graphs.

## 5. OpenAPI / Swagger

Every controller endpoint carries `@ApiOperation`/`@ApiResponse` decorators;
DTOs are the single source of truth for both `class-validator` runtime
validation and generated OpenAPI schema (no separate hand-maintained spec).
Swagger UI is exposed only in non-production environments by default.
