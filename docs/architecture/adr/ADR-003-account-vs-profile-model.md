# ADR-003: User Account and Memory Profile as Distinct Aggregates

## Status
Accepted

## Context
Memora must support recording memories for people who are not, and may
never be, Memora account holders (a deceased grandparent, a very elderly
relative), while also supporting that same person later joining and taking
control of their own profile. A single "User" model conflating login
identity with "the person being remembered" cannot represent either the
pre-registration state or the ownership-transfer-on-claim requirement.

## Decision
Model `User` (authenticatable account) and `MemoryProfile` (subject of
preserved memories) as separate aggregates, related only through
`Family` membership and an explicit `MemoryProfileClaim` process (see
`03-identity-and-permissions.md` §1 and §4). `MemoryProfile.createdByUserId`
and `MemoryProfile.claimedByUserId` are tracked separately, and consent
authority follows the *claimed* subject, not the creator, once a claim is
verified.

## Alternatives considered
- **MemoryProfile as a role/flag on User** — rejected: forces every
  memory-profile subject to have a login account, breaking the "record
  memories for someone who hasn't joined yet, or never will" scenario that
  is core to the product's stated use case.
- **No claiming mechanism (creator permanently owns the profile)** —
  rejected: violates the explicit product rule that whoever creates a
  profile must not permanently own another living person's identity/voice
  consent authority.

## Consequences
- Every consent-related and voice-related feature must check *who currently
  controls* a profile (claimed subject if claimed, else the creator/family
  admins) rather than assuming a fixed owner — this adds a resolution step
  everywhere consent is checked, implemented once in `ConsentModule`.
- Reporting/analytics that ask "how many people use Memora" must
  distinguish User count from MemoryProfile count — these are genuinely
  different numbers and both matter for the product (accounts = monetizable
  users; profiles = the actual content/value being created).
