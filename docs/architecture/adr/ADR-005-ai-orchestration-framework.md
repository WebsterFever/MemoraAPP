# ADR-005: LangChain for Model Abstraction, LangGraph for Stateful Flows Only

## Status
Accepted

## Context
The product needs (a) a swappable LLM/embedding provider layer so the
concrete model vendor isn't hardwired throughout the codebase, and (b) a
way to express the RAG pipeline's conditional/stateful behavior (confidence
gating, specialized-node dispatch) and the guided interview's multi-turn,
resumable behavior, without producing an unmaintainable pile of bespoke
control flow — but also without adopting "agents" where a plain function
call would do, per the explicit instruction not to build agents for
marketing's sake.

## Decision
- **LangChain** provides the chat-model and embeddings interfaces (behind
  which any concrete provider is injected via NestJS DI), structured-output
  parsing bound to Zod schemas, and simple LCEL chains for single-shot
  operations (extraction, evaluation, query rewriting, translation).
- **LangGraph** is used for exactly two flows: the RAG conversation graph
  and the guided-interview graph (`04-ai-architecture.md` §6), both of which
  have genuine multi-step conditional state that a graph representation
  makes more auditable than nested conditionals.
- The concrete LLM provider is abstracted behind a `ChatModelPort`; initial
  provider(s) TBD per executive-summary open question #1.

## Alternatives considered
- **Raw provider SDK calls everywhere, no framework** — rejected: would
  scatter retry/parsing/provider-swap logic across every call site, directly
  against engineering rule #9.
- **LangGraph for everything, including single-shot calls** (extraction,
  evaluation) — rejected: adds graph-execution overhead and indirection with
  no behavioral benefit for a linear "input → structured output" operation.
- **A fully autonomous tool-calling agent for the Conversation AI** — rejected:
  the product's core trust promise depends on retrieval and generation being
  deterministic, auditable, and citation-checked at each step; an
  open-ended agent loop would make hallucination containment (doc 04 §3,
  step 11) much harder to guarantee.

## Consequences
- Swapping or adding an LLM provider touches only the `ChatModelPort`
  implementation, never `RagModule` or `InterviewModule` internals.
- New "specialized agents" (RecipeAgent, TimelineAgent, etc.) must justify
  themselves as graph nodes with measurable value (different prompt
  framing/output shape), not as a way to appear more sophisticated — this
  is a standing review criterion for Phase 9.
