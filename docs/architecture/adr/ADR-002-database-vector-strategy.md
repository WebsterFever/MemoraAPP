# ADR-002: PostgreSQL + pgvector as the Initial Vector Store

## Status
Accepted for MVP (revisit at scale — see Consequences)

## Context
The RAG pipeline needs vector similarity search over `MemoryChunk`
embeddings, combined with relational data (authorization, metadata
filtering) and keyword/full-text search. The brief explicitly specifies
Postgres + pgvector for the initial implementation.

## Decision
Use a single PostgreSQL instance with the `pgvector` extension for both
relational data and embeddings. Hybrid retrieval combines pgvector cosine
similarity search with native Postgres full-text search (`tsvector`), fused
via Reciprocal Rank Fusion at the application layer. Authorization is
enforced via mandatory repository-layer filters plus Postgres Row-Level
Security (see `07-security-privacy-deletion.md` §2).

## Alternatives considered
- **Dedicated vector DB (Pinecone, Weaviate, Qdrant)** — better raw vector
  search performance/scale ceiling, but introduces a second system that
  must be kept in sync with authorization state living in Postgres (a
  replication-lag/consistency risk exactly where correctness matters most:
  "don't leak family B's memories to family A"). Rejected for MVP; revisit
  once chunk volume or query latency actually demands it — `SearchModule`
  is designed so this migration doesn't touch calling code (ADR referenced
  in `10-testing-cicd-devex.md` §3).
- **IVFFlat instead of HNSW index** — kept as a documented fallback only if
  the chosen hosting provider's pgvector version doesn't support HNSW;
  HNSW is preferred for better recall/latency tradeoff at our expected
  scale.

## Consequences
- One system to operate for MVP (lower ops burden, one source of
  transactional truth for authorization + content).
- Requires a Postgres host that supports the pgvector extension at a
  sufficient version for HNSW (open question — see executive summary §7,
  item 5, re: managed vs. self-hosted Postgres).
- A future migration to a dedicated vector store is possible without a
  domain-model rewrite because vector search is isolated behind
  `SearchModule`, but will require a data-sync/authorization-parity design
  at that time.
