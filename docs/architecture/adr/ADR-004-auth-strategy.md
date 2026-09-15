# ADR-004: JWT Access Tokens + Refresh Token Rotation

## Status
Accepted

## Context
Mobile clients need a session mechanism that is secure against token theft,
doesn't require the API to hold server-side session state for every request
(supporting horizontal scaling), and supports a distinct "step-up" tier for
high-risk operations without forcing re-login for normal usage.

## Decision
- Short-lived (minutes) stateless **access JWTs** for normal requests.
- **Refresh tokens**, stored hashed server-side, rotated on every use;
  reuse of a rotated (already-exchanged) token revokes the entire token
  family, forcing re-authentication (theft detection).
- A separate, short-lived **step-up token**, issued only after fresh
  password (and future MFA) verification, required in addition to the
  access token for high-risk endpoints (`03-identity-and-permissions.md` §6).
- Passwords hashed with Argon2id; rate limiting on all `/auth/*` endpoints.

## Alternatives considered
- **Server-side session store (Redis-backed sessions) only** — rejected as
  the sole mechanism: works fine for revocation but reintroduces a
  stateful check on every request; a hybrid isn't needed when JWT + rotation
  + a revocation list for refresh tokens covers the real requirement
  (fast normal-path auth, revocable when needed).
- **Single long-lived token with no rotation** — rejected: no defense
  against token theft/replay, unacceptable given the sensitivity of the data.
- **Requiring password re-entry for all sensitive-adjacent actions**
  (matching the brief's explicit "do not repeatedly request passwords for
  normal operations") — rejected as too broad; step-up is scoped only to
  the specific high-risk operation list in doc 03 §6.

## Consequences
- Refresh token storage/rotation logic must be implemented carefully and is
  covered by a mandatory e2e test ("refresh token rotation works").
- Step-up token issuance is a distinct, testable code path
  (`StepUpGuard`), decoupled from normal session lifetime, so it can't be
  accidentally bypassed by a long-lived access token.
- MFA/passkey addition later only strengthens the *step-up* verification
  step, not the whole auth system — a contained change (open question #8 in
  the executive summary).
