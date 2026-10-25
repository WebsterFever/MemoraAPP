# Synthetic multilingual evaluation dataset (Phase 6, Checkpoint 3)

`synthetic-memories.json` contains 5 entirely fictional memories (Haitian
Creole recipe, French childhood story, English life advice, Haitian Creole
family history, French place memory) plus 11 evaluation questions: same-
language, cross-language, and unrelated, each with an
`expectedSupportingMemoryIds` list to check retrieval/generation against.

## Rules

- **Fictional only.** Every name, place, and story is invented for this
  dataset. None of it describes a real person.
- **Never insert this into real data.** Do not seed these memories into any
  real `Family`, `MemoryProfile`, or production/staging database. If a future
  checkpoint needs to run this dataset against the real pipeline, it must use
  a disposable test family/profile created and torn down for that purpose
  only — never a real user's data.
- **No paid API calls without explicit approval.** Embedding or generating
  answers for this dataset spends real OpenAI credits. Do not run an
  evaluation against live OpenAI endpoints without asking first, each time.
- This file is a static fixture, not wired into any test or script yet. It
  exists so the dataset is reviewable and version-controlled before any
  evaluation run is proposed.
