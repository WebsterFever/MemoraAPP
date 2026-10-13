# React Native Mobile Architecture

## 1. Feature-based structure (not a giant `components/`)

```
apps/mobile/
  app/                        # Expo Router file-based routes (thin, delegate to features)
    (auth)/
      login.tsx
      register.tsx
    (app)/
      index.tsx                # Home: family + profile list
      profile/[profileId]/
        index.tsx               # Profile home (Ask / Add Memory / Interview / ...)
        conversation.tsx
        memories/[memoryId].tsx
        interview.tsx
        questions.tsx
        timeline.tsx
        recipes.tsx
        family-graph.tsx
        photos.tsx
        recordings.tsx
    _layout.tsx
  src/
    features/
      auth/
        api/                   # TanStack Query hooks calling the backend
        components/
        hooks/
        screens/
        types.ts
      families/
      memory-profiles/
      memory-capture/
        audio-recording/       # mic button, waveform, recording state machine
        photo-capture/
        text-capture/
      guided-interview/
      memory-conversation/     # chat UI, message bubbles, citation viewer
      family-questions/        # Ask Them Later queue
      timeline/
      family-graph/
      voice-playback/          # original-source player, AI-audio player, clearly distinct components
      consent/
      account-settings/
    shared/
      design-system/           # Memora's own components: buttons, bubbles, avatars, typography — NOT WhatsApp assets
      api-client/               # fetch wrapper, auth header/refresh interceptor
      state/                    # Zustand stores, scoped narrowly (see §2)
      forms/                    # React Hook Form + Zod resolver helpers
      i18n/
      types/                    # generated from backend OpenAPI where possible
  package.json
```

Each `features/*` folder is close to self-contained: its own API hooks,
components, and screens. Shared design-system primitives live in
`shared/design-system`; a feature never reaches into another feature's
internals.

## 2. State management boundaries

| State | Tool | Why |
|---|---|---|
| Server data (memories, conversations, profiles, family list) | **TanStack Query** | Caching, refetch-on-focus, optimistic updates for message send, background sync — this is server state, not client state |
| Auth session (access token presence, current user) | **Zustand** (small store) + SecureStore for the actual tokens | Needs to be read synchronously by the API client's interceptor and route guards; SecureStore is the source of truth, Zustand mirrors "is authenticated" for reactive UI |
| In-progress recording state (recording/paused, elapsed time, waveform buffer) | **Zustand**, scoped to `memory-capture/audio-recording` | Ephemeral, high-frequency updates (waveform), not server state, not worth a Query cache entry |
| Active guided-interview session UI state (current question, transient "did they skip") | **Zustand**, scoped to `guided-interview` | Local interaction state layered on top of the server-backed `InterviewSession` fetched via Query |
| Form state (registration, profile creation, consent forms) | **React Hook Form + Zod** | Validation parity with backend DTOs (same Zod schemas can be shared via `packages/shared` where the shape matches) |

Zustand is **not** used as a general app-wide store — each store is scoped
to the feature that owns it, per the brief's "Zustand only for appropriate
local/global client state" instruction. If data comes from the server, it
lives in TanStack Query, full stop.

## 3. Core screens (from the product brief)

- **Home** — family + list of Memory Profiles with memory counts and "last
  memory" timestamp; `+ Add Memory Profile`.
- **Memory Profile home** — the action hub: Ask, Add Memory (Talk/Write/
  Photo/Video), Start Interview, Questions Waiting, Life Story, Timeline,
  Recipes, Family, Advice, Photos, Original Recordings.
- **Memory Conversation (chat)** — message list, bubbles, per-answer action
  row (Hear AI response / Hear Original / Read Transcript / View Sources /
  Related Memories), typing/generating indicator, never implies the AI *is*
  the person (copy and avatar treatment reinforce "AI reconstruction from
  preserved memories").
- **Audio recording** — large mic button, live waveform, elapsed time,
  pause/stop, post-record review before upload.
- **Guided interview** — one question at a time, skip/pause/end always
  visible, progress indicator tied to category (not to global "% done" —
  coverage is a heuristic, doc 04 §2, and should not be presented to the
  user as a precise completion percentage).
- **Ask Them Later queue** — pending questions for a profile, answer via
  Talk/Write/Photo/Video, same capture components as normal memory capture.
- **Original source viewer** — audio player seekable to a citation's
  timestamp, synced transcript highlight, toggle to related photos.
- **Timeline** — decade/year buckets, visual distinction for `EXACT` vs.
  `APPROXIMATE` vs. `YEAR_ONLY` vs. `UNKNOWN` date certainty.
- **Family graph** — simple node/edge view built from `Person`/`Relationship`,
  explicitly sourced (tap a relationship to see which memory stated it).
- **Consent & privacy settings** — per-profile consent toggles, all gated by
  step-up reauthentication for grant/revoke of sensitive consents.
- **Delete flows** — memory delete confirmation (impact-specific text),
  profile delete (impact summary + step-up), account delete (step-up +
  ownership-transfer prompt if applicable).

## 4. Design system principles (original, not WhatsApp-derived)

- Own type scale, spacing scale, color system, and iconography — no reused
  bubble shapes, colors, or iconography from existing messaging apps.
- Message bubbles visually distinguish **three** content provenances, not
  just "me vs. them": the user's question, the AI-generated grounded answer
  (with a citation affordance always visible when citations exist), and
  played-back original source content (visually distinct treatment, e.g., a
  waveform-styled bubble vs. a text bubble) — this reinforces the
  "Original vs. AI Answer vs. Transcript" mental model from the product
  brief rather than presenting everything as generic chat.
- Recording UI uses a distinct accent treatment for "recording in progress"
  vs. "AI is generating a response" vs. "processing in background" — three
  different states the brief calls out (delivery/loading states, typing/
  generation indicators) that must never be visually conflated.

## 5. Networking & security on the client

- `shared/api-client` wraps `fetch`, attaches the access token, and
  transparently performs refresh-token rotation on 401 (single-flight
  refresh to avoid a stampede of concurrent refresh calls).
- Access + refresh tokens are stored in **SecureStore**, never AsyncStorage
  or plain state.
- No AI provider keys, no direct provider calls — every AI/voice/media
  operation goes through the backend, per engineering rule #5.
- Strict TypeScript throughout; API response types are validated against
  Zod schemas shared with the backend where practical (via
  `packages/shared`/`packages/ai-schemas`) so a backend contract change is a
  type error on the client, not a runtime surprise.

## 6. App interface localization (`shared/i18n/`, added Phase 6 planning)

This section covers **app chrome localization only** — navigation, labels,
buttons, validation messages, settings. It is a distinct concern from the
multilingual *memory content* architecture (original recording language,
cross-language retrieval, AI answer language), which lives in doc 05 §6 —
see that section for how the three language dimensions (app interface,
original memory, AI conversation) relate to each other.

### Library choice

`i18next` + `react-i18next`, with `expo-localization` for device-locale
detection. This is the standard, actively-maintained combination for
Expo/React Native — no framework-specific lock-in, broad ecosystem support
(pluralization, interpolation, namespacing) that a hand-rolled solution
would have to reinvent, and the preview/Phase 0 scaffold already reserved
`shared/i18n/` for exactly this.

### Initial interface languages

```
en  — English   (default/fallback)
fr  — French
ht  — Haitian Creole
es  — Spanish
pt  — Portuguese
it  — Italian
de  — German
```

**Scope honesty**: this list is the *interface* language set (navigation,
buttons, labels) — it is not a claim about transcription/translation/AI
answer quality in every one of these languages. Per the executive summary's
own risk #1/#2, embedding and generation quality (especially for Haitian
Creole, a low-resource language) must be empirically verified per language,
not assumed from the interface being translated. Interface localization and
AI-quality verification are tracked as separate checkpoints (doc 05 §7,
items 5 and 6) precisely so one is never used to imply the other.

### Extensibility — adding a language later must not require a rewrite

```
shared/i18n/
  index.ts              # i18next init, language-detection + persistence wiring
  locales/
    en/common.json
    en/validation.json
    fr/common.json
    fr/validation.json
    ht/common.json
    ...
```

Namespaced JSON resource files per language, loaded via i18next's resource
bundles. Adding a new language is purely additive: a new `locales/<code>/`
directory plus registering the code in one config list — no changes to any
screen component, since screens only ever call `t("namespace:key")` and
never hardcode strings (this is the enforcement rule for all *new* screens
going forward; it does not retroactively rewrite already-shipped Phase 0–5
screens in this same change).

### Settings → Language

A dedicated settings screen lets the user pick their app interface language
from the supported list. Selecting a language:

- Immediately re-renders all currently mounted screens (i18next's React
  bindings re-render subscribed components on language change — no app
  restart required).
- Persists the choice (`expo-secure-store` or `AsyncStorage` — no
  sensitivity requirement here, unlike auth tokens, so `AsyncStorage` is
  sufficient) so it survives an app restart.
- Updates date/time formatting where locale-sensitive (via a thin wrapper
  around `Intl.DateTimeFormat`, keyed off the same language code — not a
  second, separate locale setting).

### Automatic detection with override

On first launch (no persisted preference yet): read the device locale via
`expo-localization`, select it if it's in the supported list, otherwise
default to English. This is a one-time default, never a silent override of
an explicit later choice — once a user has picked a language in Settings
(or implicitly accepted the detected one, which is still recorded as "the
current preference," not re-detected on every launch), device-locale
detection is never consulted again.
