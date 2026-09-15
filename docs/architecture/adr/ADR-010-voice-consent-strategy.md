# ADR-010: Voice Synthesis Gated Behind an Explicit, Revocable Consent Record

## Status
Accepted

## Context
Voice cloning/synthesis of a real person carries real ethical and legal
exposure (biometric-data-adjacent treatment in several jurisdictions,
potential for deceptive impersonation) and the brief is explicit: never
clone or synthesize a voice without verifiable consent, and the rest of the
app must keep working if voice synthesis is unavailable.

## Decision
- `ConsentRecord{type: VOICE_SYNTHESIS}` is a distinct, independently
  grantable/revocable consent from all other consent types (sharing, AI
  conversation, export, post-mortem access) — enabling one never implies
  the others.
- `VoiceProvider.createAuthorizedVoice()` and any use of a resulting
  `providerVoiceId` require a live (not cached) check that this consent is
  `GRANTED`, checked immediately before every provider call, not just at
  feature-enable time (`05-multilingual-multimodal-voice.md` §4).
- Consent authority follows the claimed profile subject (ADR-003), not the
  profile's creator.
- Revocation takes effect immediately and disables the `VoiceProfile`; the
  app falls back to original audio clips, then a standard synthetic voice,
  never to a silent failure (`05-multilingual-multimodal-voice.md` §4).
- AI-generated audio is always visually labeled as such in the UI, distinct
  from original-recording playback.

## Alternatives considered
- **Treat voice consent as a subtype of a generic "sharing" consent** —
  rejected: collapsing these would mean revoking general sharing could
  ambiguously affect voice synthesis (or vice versa), and voice carries
  distinct legal/ethical weight that deserves its own explicit audit trail
  (`VoiceConsent` table, `02-domain-model.md` §2).
- **Cache consent status for performance** — rejected: the correctness
  requirement ("revocation takes effect immediately") outweighs the minor
  latency cost of a fresh check per synthesis call; this mirrors the same
  reasoning applied to memory-deletion tombstones (doc 07 §3).

## Consequences
- Voice features can ship later (Phase 12) without ever being a hard
  dependency for the rest of the app — every voice-related code path has a
  defined non-voice fallback from day one, so voice can be entirely
  disabled (e.g., provider unavailable in a region) without breaking core
  product flows.
- Legal/compliance review of the voice feature can focus narrowly on the
  `ConsentModule` + `VoiceModule` boundary, since that's the sole gate.
