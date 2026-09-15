# Phase 0 Diagrams

## A. System Architecture

```mermaid
flowchart TB
    subgraph Client["Mobile Client"]
        RN["React Native + Expo\n(Expo Router, TanStack Query, Zustand)"]
    end

    subgraph Edge["Edge / Gateway"]
        LB["Load Balancer / API Gateway\nTLS termination, rate limiting"]
    end

    subgraph API["NestJS API (stateless, horizontally scalable)"]
        Auth["AuthModule"]
        Fam["FamiliesModule / PermissionsModule"]
        Mem["MemoriesModule / ProfilesModule"]
        Conv["ConversationsModule / MessagesModule"]
        Media["MediaModule / AudioModule"]
        AI["AIOrchestratorModule\n(LangChain / LangGraph)"]
        Obs["ObservabilityModule"]
    end

    subgraph Async["Async Processing"]
        Redis[("Redis")]
        BullMQ["BullMQ Workers\n(transcription, extraction,\nembeddings, deletion)"]
    end

    subgraph Data["Data Plane"]
        PG[("PostgreSQL + pgvector")]
        Obj[("Object Storage\n(S3-compatible)\noriginal audio/photo/video/docs")]
    end

    subgraph ExtAI["External AI Providers"]
        LLM["LLM API\n(chat / structured output)"]
        Emb["Embedding API"]
        STT["Speech-to-Text"]
        TTS["Text-to-Speech"]
    end

    subgraph Observability["Observability"]
        Langfuse["Langfuse\n(trace store)"]
    end

    RN -->|HTTPS + short-lived JWT| LB --> API
    API --> PG
    API -->|enqueue jobs| Redis
    Redis --> BullMQ
    BullMQ --> PG
    BullMQ --> Obj
    BullMQ --> STT
    BullMQ --> Emb
    API -->|signed URL issuance| Obj
    RN -.->|GET media via signed URL| Obj
    AI --> LLM
    AI --> Emb
    AI --> TTS
    Auth --> PG
    Fam --> PG
    Mem --> PG
    Conv --> PG
    Media --> Obj
    Obs --> Langfuse
    AI --> Obs
```

## B. AI / RAG Pipeline

```mermaid
flowchart TD
    Q["User question\n(any supported language)"] --> IC["Intent Classification\nGENERAL_MEMORY / RECIPE / LIFE_EVENT /\nPERSON / RELATIONSHIP / PHOTO_MEMORY /\nSTORY / ADVICE / UNKNOWN"]
    IC --> QR["Query Rewriting\n(coreference resolution,\nconversation-history context)"]
    QR --> AuthF["Authorization Filter\nresolve profileIds the requesting\nuser may query in this family"]
    AuthF --> HR{"Hybrid Retrieval"}
    HR --> VS["Vector Search\n(pgvector, multilingual embedding,\ncosine similarity, top-K)"]
    HR --> KS["Keyword / Full-Text Search\n(original text + translations)"]
    VS --> Fuse["Score Fusion (RRF)"]
    KS --> Fuse
    Fuse --> MF["Metadata Filtering\n(profile, date range, topic, memoryType)"]
    MF --> RR["Reranking\n(cross-encoder or LLM rerank)"]
    RR --> Gate{"Confidence >= threshold?"}
    Gate -- "No" --> Refuse["Refusal Response\n+ 'Ask Them Later' suggestion"]
    Gate -- "Yes" --> CB["Context Construction\n(chunks + citation metadata)"]
    CB --> SA{"Specialized Node\n(if applicable)"}
    SA --> RecipeAgent["RecipeAgent"]
    SA --> TimelineAgent["TimelineAgent"]
    SA --> RelAgent["RelationshipAgent"]
    SA --> StoryAgent["StoryAgent"]
    SA --> GenericAgent["MemoryRetrievalAgent"]
    RecipeAgent --> GR
    TimelineAgent --> GR
    RelAgent --> GR
    StoryAgent --> GR
    GenericAgent --> GR["GroundedResponseAgent\n(structured output: answer + citations)"]
    GR --> CV["Citation Validation\n(every cited chunk must exist,\nbelong to an authorized profile,\nand support the claim)"]
    CV --> Safety["SafetyAgent\n(no impersonation, no medical/legal\nadvice framing)"]
    Safety --> Eval["EvaluationAgent\n(groundedness, relevance, completeness,\ncitationQuality, hallucinationRisk)"]
    Eval -->|flag if low score| FlagStore[("Evaluation table\nfor review")]
    Eval --> Resp["Response to client\n{answer, confidence, citations, actions}"]
    Refuse --> Resp
```

## C. Audio Processing Pipeline

```mermaid
flowchart LR
    Rec["Mobile: record audio"] --> Upload["Secure upload\n(signed URL, chunked)"]
    Upload --> Job1["Job: ingest\ncreate MemorySource + MediaAsset\nstatus=PROCESSING"]
    Job1 --> Job2["Job: language detection"]
    Job2 --> Job3["Job: transcription (STT)"]
    Job3 --> Job4["Job: transcript cleanup\n(disfluency removal, punctuation)"]
    Job4 --> Job5["Job: semantic segmentation\n(split into coherent memory units)"]
    Job5 --> Job6["Job: memory extraction\n(structured output: title, summary,\npeople, places, topics, date)"]
    Job6 --> Job7["Job: metadata extraction\n(memoryType, coverage domain tagging)"]
    Job7 --> Job8["Job: translation (optional,\nfor keyword search + display)"]
    Job7 --> Job9["Job: embedding generation\n(per chunk, original-language text)"]
    Job9 --> Job10["Job: vector storage (pgvector)"]
    Job10 --> Ready["Memory.status = READY\nsearchable + citable"]
    Job1 -.always retained.-> OrigAudio[("Original audio\n(never deleted while memory exists)")]
    Job3 -.always retained.-> OrigTranscript[("Original-language transcript\n(never overwritten by translation)")]

    Job2 -.failure.-> Retry1["Retry w/ backoff\n(BullMQ)"]
    Job3 -.failure.-> Retry1
    Job6 -.failure.-> Retry1
    Retry1 -.exhausted.-> DLQ["Dead-letter queue\nMemory.status = FAILED\nsurfaced to owner + admin"]
```

## D. Security Architecture

```mermaid
flowchart TB
    subgraph Perimeter
        TLS["TLS 1.2+ everywhere"]
        RateLimit["Rate limiting\n(auth, AI endpoints, uploads)"]
        WAF["Basic WAF / abuse rules at edge"]
    end
    subgraph AuthN["Authentication"]
        JWT["Short-lived access JWT\n(minutes)"]
        Refresh["Refresh token rotation\n(hashed at rest, reuse detection\n=> revoke token family)"]
        StepUp["Step-up reauthentication\n(password / MFA) for\nhigh-risk operations"]
    end
    subgraph AuthZ["Authorization (server-side only)"]
        RBAC["Family role check\n(OWNER/ADMIN/CONTRIBUTOR/VIEWER)"]
        ProfilePerm["Profile-level permission check\n(MEMORY_OWNER/CONTRIBUTOR/VIEWER)"]
        Consent["Consent check\n(AI_CONVERSATION, VOICE_SYNTHESIS, ...)"]
        RLS["Postgres Row-Level Security\n(defense in depth on memory tables)"]
    end
    subgraph DataProtection["Data Protection"]
        EncTransit["Encryption in transit"]
        EncRest["Encryption at rest\n(DB volume + object storage)"]
        SignedURL["Short-lived signed URLs\nfor all media access"]
        SecretsMgmt["Secret manager\n(never in mobile bundle,\nnever in git)"]
    end
    subgraph Audit
        AuditLog[("AuditLog table\nauth, permission changes,\nconsent changes, deletions")]
    end

    TLS --> JWT
    RateLimit --> JWT
    JWT --> RBAC --> ProfilePerm --> Consent --> RLS
    StepUp --> AuditLog
    RBAC --> AuditLog
    Consent --> AuditLog
    RLS --> EncRest
    SignedURL --> EncTransit
    SecretsMgmt --> AuthN
```

## Flow A — Account Registration

```mermaid
sequenceDiagram
    participant U as User (mobile)
    participant API as NestJS API
    participant DB as PostgreSQL

    U->>API: POST /auth/register {email, password, displayName}
    API->>API: validate input (class-validator), check password policy
    API->>DB: check email uniqueness
    API->>API: hash password (Argon2id)
    API->>DB: create User
    API->>DB: create refresh token record (hashed)
    API-->>U: access token + refresh token (SecureStore)
    API->>DB: AuditLog(ACCOUNT_CREATED)
```

## Flow B — Create Memory Profile

```mermaid
sequenceDiagram
    participant U as Webster (mobile)
    participant API as NestJS API
    participant DB as PostgreSQL

    U->>API: POST /profiles {displayName:"Mom", relationship:"MOTHER", preferredLanguage:"ht"}
    API->>API: AuthGuard (valid access token)
    API->>DB: ensure/create default Family for Webster if none
    API->>DB: create MemoryProfile{status:ACTIVE, createdByUserId:webster}
    API->>DB: create MemoryProfilePermission{userId:webster, role:MEMORY_OWNER}
    API-->>U: 201 { profile }
```

## Flow C — Invite Family Member

```mermaid
sequenceDiagram
    participant Owner as Webster
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Mom as Mom (mobile)

    Owner->>API: POST /families/:id/invitations {email:mom@..., role:CONTRIBUTOR}
    API->>API: RBAC check (Owner/Admin only)
    API->>DB: create FamilyInvitation{token, expiresAt}
    API-->>Owner: invitation created (share link/code)
    Mom->>API: POST /invitations/:token/accept (after Mom registers/logs in)
    API->>DB: validate token not expired/used
    API->>DB: create FamilyMembership{role:CONTRIBUTOR}
    API->>DB: AuditLog(INVITATION_ACCEPTED)
    API-->>Mom: joined family
```

## Flow D — Record Audio Memory

```mermaid
sequenceDiagram
    participant Mom as Mom (mobile)
    participant API as NestJS API
    participant Obj as Object Storage
    participant Q as BullMQ
    participant DB as PostgreSQL

    Mom->>API: POST /media/upload-url {contentType:audio/m4a}
    API-->>Mom: signed upload URL
    Mom->>Obj: PUT audio file (direct upload)
    Mom->>API: POST /profiles/:id/memories {mediaAssetId, sourceType:AUDIO}
    API->>DB: create MemorySource{status:PROCESSING}
    API->>Q: enqueue ProcessAudioMemory job
    API-->>Mom: 202 Accepted {memoryId, status:PROCESSING}
    Q->>DB: pipeline stages update Memory/MemoryChunk (see Diagram C)
    Q-->>Mom: (in-app) status update: READY
```

## Flow E — Guided AI Memory Interview

```mermaid
sequenceDiagram
    participant Mom as Mom (mobile)
    participant API as NestJS API
    participant AI as Memory Builder AI (LangGraph)
    participant DB as PostgreSQL

    Mom->>API: POST /profiles/:id/interviews {category: null}
    API->>DB: read MemoryCoverage for profile
    API->>AI: select next question (coverage-aware)
    AI-->>API: question (in Mom's preferred/detected language)
    API->>DB: create InterviewQuestion
    API-->>Mom: display question (audio/text)
    Mom->>API: submit answer (audio)
    API->>DB: create InterviewAnswer, link to new Memory via pipeline (Flow D)
    API->>AI: generate follow-up using answer + coverage state
    AI-->>API: next question
    API->>DB: update MemoryCoverage estimate
    loop until Mom pauses/ends
        API-->>Mom: next question
    end
```

## Flow F — Ask a Memory Question

```mermaid
sequenceDiagram
    participant W as Webster (mobile)
    participant API as NestJS API
    participant RAG as RAG Pipeline (Diagram B)
    participant DB as PostgreSQL

    W->>API: POST /profiles/:id/conversations/:cid/messages {text:"How did Mom make soup joumou?"}
    API->>API: AuthZ: Webster has access to profile :id?
    API->>RAG: run(question, profileId, conversationHistory)
    RAG->>DB: authorized hybrid retrieval + rerank
    RAG-->>API: {answer, confidence, citations, actions}
    API->>DB: persist Message + MessageCitation
    API-->>W: response with citations
```

## Flow G — Cross-Language Memory Question

```mermaid
sequenceDiagram
    participant W as Webster (English)
    participant API as NestJS API
    participant RAG as RAG Pipeline
    participant DB as PostgreSQL (chunks stored in Creole)

    W->>API: "How old was Mom when she met Dad?"
    API->>RAG: run(question="...", language=en)
    RAG->>RAG: embed question with multilingual embedding model
    RAG->>DB: vector search across chunks (language-agnostic similarity)
    DB-->>RAG: top chunk (original text: Haitian Creole)
    RAG->>DB: keyword search also checks MemoryTranslation (en/fr) for boosting
    RAG->>RAG: generate answer in English, cite original Creole chunk
    RAG-->>API: {answer (en), citations: [{sourceLanguage: "ht", quote: "..."}]}
    API-->>W: "Based on Mom's preserved memory, she said she was 22 when she met Dad."
```

## Flow H — Knowledge Gap → Ask Them Later

```mermaid
sequenceDiagram
    participant W as Webster
    participant API as NestJS API
    participant RAG as RAG Pipeline
    participant DB as PostgreSQL
    participant Mom as Mom (mobile)

    W->>API: "What was Grandpa's first job?"
    API->>RAG: run(question, profileId=Mom)
    RAG->>DB: retrieval finds nothing above confidence threshold
    RAG-->>API: {answer:null, confidence:low, actions:[{type:"ASK_PROFILE_OWNER"}]}
    API-->>W: "I couldn't find a memory where Mom talked about that." + [Ask Mom]
    W->>API: POST /profiles/:id/questions {text:"What was Grandpa's first job?"}
    API->>DB: create FamilyMemoryQuestion{status:WAITING_FOR_ANSWER}
    API-->>Mom: notification: "Webster has a question for your memories."
    Mom->>API: POST /questions/:id/answer {audio}
    API->>DB: pipeline processes answer (Flow D), link Memory to FamilyMemoryQuestion
    API->>DB: FamilyMemoryQuestion.status = ANSWERED
    Note over W,Mom: Next time Webster asks, RAG finds the new memory.
```

## Flow I — Original Source Playback

```mermaid
sequenceDiagram
    participant W as Webster (mobile)
    participant API as NestJS API
    participant Obj as Object Storage

    W->>API: GET /citations/:citationId
    API->>API: AuthZ check (does W have access to underlying profile?)
    API-->>W: {sourceType:AUDIO, mediaAssetId, startTime:82.4, endTime:101.7, transcriptSnippet}
    W->>API: GET /media/:mediaAssetId/playback-url
    API-->>W: short-lived signed URL
    W->>Obj: GET signed URL (range request)
    Obj-->>W: audio bytes
    W->>W: seek player to startTime, highlight transcript
```

## Flow J — Voice Conversation (future, design-only)

```mermaid
sequenceDiagram
    participant W as Family member (mobile)
    participant API as NestJS API
    participant STT as Speech-to-Text
    participant RAG as RAG Pipeline
    participant TTS as Text-to-Speech (authorized voice or standard)
    participant DB as PostgreSQL

    W->>API: stream audio (voice call mode)
    API->>STT: transcribe streaming audio
    STT-->>API: partial/final transcript
    API->>RAG: run(question=transcript, profileId)
    RAG->>DB: same authorized hybrid retrieval + grounding as Flow F
    RAG-->>API: {answer, confidence, citations}
    API->>DB: check ConsentRecord{VOICE_SYNTHESIS}
    alt consent granted
        API->>TTS: synthesize(answer, authorizedVoiceId)
    else not granted
        API->>TTS: synthesize(answer, standardVoiceId)
    end
    TTS-->>API: audio stream
    API-->>W: audio response (UI clearly labeled "AI-generated audio")
    Note over API,RAG: Grounding is never skipped to reduce latency.
```

## Flow K — Delete Individual Memory

```mermaid
sequenceDiagram
    participant U as Memory owner / authorized user
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as BullMQ

    U->>API: DELETE /memories/:id
    API->>API: AuthZ check (ownership/role)
    API-->>U: confirm dialog: "This removes N chunks, audio, transcript..."
    U->>API: DELETE /memories/:id?confirm=true
    API->>DB: transaction: Memory.status=DELETED, deletedAt=now() (tombstone)
    Note over API,DB: Tombstone check is part of every retrieval query;\nmemory is unsearchable immediately, before cleanup runs.
    API->>Q: enqueue PhysicalDeletion job
    API->>DB: AuditLog(MEMORY_DELETED)
    API-->>U: 202 Accepted
    Q->>DB: delete MemoryChunk rows, embeddings
    Q->>Q: delete MediaAsset from object storage
    Q->>DB: mark DeletionRequest.status=COMPLETED
```

## Flow L — Delete Entire Memory Profile

```mermaid
sequenceDiagram
    participant U as Owner
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as BullMQ

    U->>API: POST /profiles/:id/delete-request
    API-->>U: summary (392 memories, 126 recordings, ...) + require step-up auth
    U->>API: POST /profiles/:id/delete-request/confirm {password}
    API->>API: verify password (step-up)
    API->>DB: create DeletionRequest{targetType:PROFILE, status:CONFIRMED}
    API->>DB: MemoryProfile.status = DELETION_PENDING (immediately blocks retrieval)
    API->>Q: enqueue ProfileDeletion job graph
    API->>DB: AuditLog(PROFILE_DELETION_REQUESTED)
    API-->>U: 202 Accepted
    Q->>DB: cascade delete/tombstone Memories, Chunks, Conversations, Citations
    Q->>Q: delete all MediaAssets from object storage
    Q->>DB: delete embeddings, search indexes
    Q->>DB: DeletionRequest.status=COMPLETED, MemoryProfile.status=DELETED
    Q->>DB: AuditLog(PROFILE_DELETION_COMPLETED)
```

## Flow M — Account Deletion

```mermaid
sequenceDiagram
    participant U as User
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as BullMQ

    U->>API: POST /account/delete-request
    API-->>U: require step-up auth + explain profile ownership impact
    U->>API: POST /account/delete-request/confirm {password}
    API->>DB: check: does user solely own any MemoryProfile with other\nactive contributors/viewers?
    alt sole owner with dependents
        API-->>U: require reassignment or explicit profile deletion first
    else safe to proceed
        API->>DB: create DeletionRequest{targetType:ACCOUNT}
        API->>DB: User.status = DELETION_PENDING
        API->>Q: enqueue AccountDeletion job
        Q->>DB: anonymize/delete User PII, revoke all tokens/memberships
        Q->>DB: DeletionRequest.status=COMPLETED
        Q->>DB: AuditLog(ACCOUNT_DELETION_COMPLETED)
    end
```

## Flow N — Voice Consent / Revocation

```mermaid
sequenceDiagram
    participant Mom as Profile owner (Mom)
    participant API as NestJS API
    participant DB as PostgreSQL

    Mom->>API: POST /profiles/:id/consent {type:VOICE_SYNTHESIS, action:GRANT}
    API->>API: step-up auth required
    API->>DB: create ConsentRecord{type:VOICE_SYNTHESIS, status:GRANTED, evidence}
    API->>DB: AuditLog(CONSENT_GRANTED)
    API-->>Mom: voice synthesis features unlocked

    Mom->>API: POST /profiles/:id/consent {type:VOICE_SYNTHESIS, action:REVOKE}
    API->>DB: ConsentRecord.status = REVOKED, revokedAt=now()
    API->>DB: disable VoiceProfile immediately (checked on every synth request)
    API->>DB: AuditLog(CONSENT_REVOKED)
    API-->>Mom: confirmation; app falls back to original audio / standard voice
```
