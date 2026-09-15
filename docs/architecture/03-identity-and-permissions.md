# Identity, Family, and Permissions Architecture

## 1. User Account vs. Memory Profile (the central distinction)

| | User Account | Memory Profile |
|---|---|---|
| What it represents | A real person who can log in | A person whose memories are preserved (may or may not have a login) |
| Authentication | Yes — email/password, tokens | No — a profile never authenticates |
| Can exist without the other? | Yes, a User with no profiles yet | Yes, a profile can exist before its subject ever registers (e.g., a deceased grandparent, or Mom before she joins) |
| Relationship | One User can create/access many profiles across families they belong to | One profile belongs to exactly one Family, but can be **claimed** by a User |
| Example | Webster's login | "Mom", "Dad", "Grandmother", "Myself" |

`MemoryProfile.createdByUserId` records who *set up* the profile.
`MemoryProfile.claimedByUserId` records who the profile's *subject* actually
is, once claimed. These are frequently different people at first (Webster
creates "Mom" before Mom has an account) and the architecture must support
that gap without ever assuming the creator permanently owns the subject's
identity.

## 2. Family as the tenancy boundary

`Family` is the multi-tenancy root. All authorization ultimately reduces to:
*"is this User an active member of the Family that owns this MemoryProfile,
and if so, at what role — and does the User additionally hold a
profile-level permission?"* Every query that touches `Memory`, `MemoryChunk`,
`Conversation`, etc. must resolve through this chain — there is no direct
User → Memory relationship in the schema, by design, so it's structurally
impossible to "forget" the family check.

Cross-family isolation is therefore not a per-feature responsibility; it's
enforced once, in the authorization-resolution layer (`PermissionsModule`),
and re-validated at the database layer via Row-Level Security (see
`07-security-privacy-deletion.md` §2).

## 3. Roles

Two independent role layers exist, intentionally:

### Family-level role (`FamilyMembership.role`)
Governs family administration, not memory content directly.

| Role | Manage family | Manage subscription | Invite members | Manage any profile's metadata | Export | Delete profiles |
|---|---|---|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ (permitted data) | ✅ (permitted) |
| ADMIN | ✅ | ❌ | ✅ | ✅ | ✅ (permitted data) | ❌ |
| CONTRIBUTOR | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| VIEWER | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Profile-level role (`MemoryProfilePermission.role`)
Governs the actual memory content for one specific profile — this is where
most day-to-day authorization checks happen.

| Role | Record memories | Edit/delete own memories | Manage sharing/consent for this profile | Ask questions (RAG) | View memories |
|---|---|---|---|---|---|
| MEMORY_OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| CONTRIBUTOR | ✅ (when authorized) | own contributions only | ❌ | ✅ | ✅ |
| VIEWER | ❌ | ❌ | ❌ | ✅ | ✅ |

**Why two layers instead of one?** A family Admin should be able to invite
people and manage billing without automatically being allowed to read every
private memory in the family — e.g., a family could have Mom's profile
visible to everyone but Dad's set to a smaller circle. Collapsing these into
one role would force an all-or-nothing tradeoff between "convenient family
admin" and "private-by-default memories." Every sensitive read/write on
`Memory`/`Conversation` therefore checks the **profile-level** permission,
not just family membership.

## 4. Profile claiming

When Webster creates the "Mom" profile before Mom has ever used Memora, the
profile exists in an unclaimed state (`claimedByUserId: null`). Once Mom
registers and is invited into the family:

1. Mom is offered: "Is this your profile?" on the "Mom" MemoryProfile.
2. She submits a `MemoryProfileClaim` (MVP: verification is "an existing
   OWNER/ADMIN confirms this is correct" — stronger verification, e.g. via
   invitation email match, is a natural v1.1 hardening but not blocking MVP).
3. On approval, `MemoryProfile.claimedByUserId = mom.id`, and Mom
   automatically receives `MemoryProfilePermission{role: MEMORY_OWNER}` if
   she didn't already have it.
4. From this point, **consent decisions for that profile belong to Mom**,
   not to Webster, even though Webster remains the family OWNER and retains
   administrative rights over the family workspace itself. Webster cannot
   unilaterally grant voice-synthesis consent or export authority on Mom's
   claimed profile — only Mom (or, if she's deceased/incapacitated, whoever
   she designated via `ConsentRecord{type: DELETION_AUTHORITY}` or similar
   in advance) can.

This directly implements product rule: *"Do not assume that whoever created
a profile permanently owns another person's identity or voice."*

## 5. Invitations

`FamilyInvitation` is a token-based, time-limited, single-use invitation —
never a shared password. Flow:

1. OWNER/ADMIN creates an invitation (`email`, intended `role`).
2. Server generates a random token, stores only its hash, emails/shares a
   link containing the raw token.
3. Recipient registers (or logs in if already a User) and calls
   `POST /invitations/:token/accept`.
4. Server validates token hash, expiry, and single-use status, then creates
   the `FamilyMembership`.

Invitations never grant profile-level permissions directly — those are
assigned explicitly afterward (or via the claim flow in §4), keeping "join
the family" and "get access to a specific person's memories" as separate,
deliberate steps.

## 6. Step-up authentication

Two authentication "zones" exist:

- **Standard zone** — the normal access token is sufficient: asking
  questions, recording memories, reading permitted content, browsing.
- **Step-up zone** — requires fresh proof of identity within the current
  request, regardless of how recently the user logged in:
  - Delete a MemoryProfile
  - Delete the account
  - Export the full private archive
  - Change profile ownership / reassign a claim
  - Change critical family permissions (e.g., demote/remove an OWNER)
  - Grant or revoke voice-synthesis consent
  - Change account email or password
  - Disable MFA (once MFA exists)

Implementation: a short-lived **step-up token** (e.g., 5 minutes) is issued
by `POST /auth/step-up` after re-verifying the current password (and MFA
factor, once available). Sensitive endpoints require this step-up token in
addition to the normal access token, checked via a dedicated
`StepUpGuard`. This keeps step-up completely orthogonal to normal session
handling — no endpoint accidentally becomes "step-up required" or "not
required" by session-expiry timing.

MVP default: password re-entry satisfies step-up. MFA/passkey support is an
open question (see executive summary §7, item 8) that upgrades step-up
strength later without changing the guard's interface.

## 7. Consent model

`ConsentRecord` is deliberately generic across consent *types* so the audit
and revocation mechanics are implemented exactly once:

- `AI_CONVERSATION` — may family members run RAG queries against this
  profile at all?
- `VOICE_SYNTHESIS` — may this profile's voice be synthesized? (see
  `05-multilingual-multimodal-voice.md` §4)
- `SHARING` — may memories be shared beyond the immediate family unit
  (future: cross-family sharing, public export)?
- `POST_MORTEM_ACCESS` — may the profile remain accessible/queryable after
  the subject's death, and under what continued restrictions?
- `EXPORT` — may this profile's content be exported as a data package?
- `DELETION_AUTHORITY` — who, besides the subject themself, may authorize
  deletion of this profile (e.g., a designated family member, for a profile
  representing someone deceased or a minor)?

Every consent **change** (grant or revoke) is (a) step-up authenticated,
(b) written as a new `ConsentRecord` row rather than an in-place update where
history matters, and (c) mirrored into `AuditLog`. Revocation takes effect
**synchronously** — any code path that gates behavior on consent (e.g., the
voice synthesis endpoint) reads the live `ConsentRecord` status on every
call; it is never cached in a way that could serve a stale "granted" state.

## 8. Vector-search authorization (summary — full detail in doc 07)

Because `MemoryChunk` rows carry a denormalized `profileId`, the
authorization-resolution step in the RAG pipeline (`04-ai-architecture.md`
§3) computes the caller's authorized profile ID set **once**, up front, and
that set is what gets passed into the mandatory repository-level filter
described in `02-domain-model.md` §5. There is no scenario in the codebase
where a vector query runs without this filter — it is not optional
middleware, it is a parameter the query method requires to compile.
