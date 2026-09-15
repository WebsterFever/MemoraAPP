# ADR-006: Langfuse for AI Observability, with a Redaction-by-Default Policy

## Status
Accepted (hosting choice open — see Consequences)

## Context
Every AI-involved user interaction (interview question, RAG answer,
evaluation) needs traceable latency/token/cost/quality data for debugging
and cost control, per the brief's explicit tracing-tree requirement. This
data is sensitive by nature (it's derived from private family memories),
so the observability integration itself is a privacy-relevant design
decision, not just a tooling choice.

## Decision
Integrate Langfuse as the trace store, with the trace tree defined in
`04-ai-architecture.md` §8. **Redaction is the default**: raw transcript
text and raw user questions/answers are not sent to Langfuse by default —
only IDs, scores, token counts, latency, and cost are. A separate,
audit-logged debug-mode opt-in allows temporary full-content tracing for a
specific investigation.

## Alternatives considered
- **Custom in-house tracing (Postgres tables only, no Langfuse)** — would
  avoid a third-party dependency but reinvents trace visualization, prompt
  version comparison, and eval-score dashboards that Langfuse already
  provides; not a good use of MVP engineering time. `AIExecution`
  (Postgres) is kept regardless, as the durable cost/metrics ledger — Langfuse
  is additive for trace exploration, not a replacement for it.
- **Send full raw content to Langfuse for easier debugging** — rejected as
  the default given the sensitivity of the data; available only behind the
  explicit, audited debug-mode opt-in.

## Consequences
- Debugging a specific bad answer in production requires either working
  from redacted metadata (usually sufficient: which chunks, what scores,
  what model) or explicitly invoking debug mode, which is slightly more
  friction than "just look at the trace" — an intentional tradeoff for
  privacy.
- Hosting choice (Langfuse Cloud vs. self-hosted) remains open (executive
  summary §7, item 10) since even redacted metadata leaving the
  infrastructure has a different risk profile depending on where Langfuse
  runs; self-hosting removes that question entirely at the cost of
  operating one more service.
