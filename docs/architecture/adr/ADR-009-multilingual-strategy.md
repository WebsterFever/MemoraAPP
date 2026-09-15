# ADR-009: Multilingual Embeddings on Original-Language Text, Never Translate-Then-Store

## Status
Accepted in principle; concrete embedding model open (see Consequences)

## Context
Memora's core cross-lingual scenario (record in Haitian Creole, ask in
English, get a grounded English answer citing the Creole source) requires
retrieval to work *across* languages without ever discarding or overwriting
the original-language content, per explicit product rule.

## Decision
- Embeddings are computed on the **original-language transcript/chunk
  text**, using a multilingual embedding model whose vector space supports
  meaningful cross-lingual similarity (candidates: OpenAI
  `text-embedding-3-large`, Cohere `embed-multilingual-v3`, or an
  open-source multilingual model such as `multilingual-e5-large`).
- Translations (`MemoryTranslation`) are generated and stored **separately**
  for two purposes only: (a) improving keyword/full-text search recall via
  exact-term matching, and (b) optional display convenience — never as a
  replacement for the original transcript, and never as the sole basis for
  an embedding.
- Hybrid retrieval (vector + keyword, fused via RRF) is the mitigation for
  cases where the multilingual embedding model's cross-lingual quality is
  weaker for a lower-resource language pair (`04-ai-architecture.md` §3,
  step 4; `02-domain-model.md` §5).

## Alternatives considered
- **Translate everything to English before embedding, embed only English** —
  rejected: simpler, but two of the brief's explicit requirements ("never
  destroy the original source," and "the same memory should be findable by
  a monolingual English speaker without a separate translation step
  degrading trust in what was actually said") argue against making
  translation quality a load-bearing part of retrieval; also loses same-
  language nuance when the asker and speaker share a language.
- **Separate per-language embedding spaces with a routing layer** — rejected
  as unnecessary complexity for MVP scale; a single multilingual embedding
  space with hybrid keyword fallback is simpler and sufficient until
  evidence shows otherwise.

## Consequences
- Embedding model choice materially affects Haitian Creole retrieval
  quality specifically (a lower-resource language for most commercial
  embedding models) — this is flagged as executive-summary open question #2
  and should be validated empirically (small labeled retrieval test set)
  before being locked in, rather than assumed from vendor marketing claims.
- Changing the embedding model later requires a re-embedding migration job
  (all `MemoryChunk.embedding` values recomputed) — acceptable for MVP scale,
  but a reason to validate model choice early rather than after significant
  content volume exists.
