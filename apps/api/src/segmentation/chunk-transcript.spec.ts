import { chunkTranscript, MAX_CHUNK_CHARS } from "./chunk-transcript";

describe("chunkTranscript", () => {
  it("returns an empty array for an empty string", () => {
    expect(chunkTranscript("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(chunkTranscript("   \n\t  \n  ")).toEqual([]);
  });

  it("returns a single chunk for a short transcript", () => {
    const text = "Mom told me how she makes lemon juice on Sundays.";
    const chunks = chunkTranscript(text);
    expect(chunks).toEqual([text]);
  });

  it("normalizes internal whitespace (newlines/tabs/repeated spaces collapse to single spaces)", () => {
    const messy = "Mom told   me\n\nhow she   makes\tlemon juice.";
    const chunks = chunkTranscript(messy);
    expect(chunks).toEqual(["Mom told me how she makes lemon juice."]);
  });

  it("trims leading/trailing whitespace", () => {
    const chunks = chunkTranscript("   Hello there.   ");
    expect(chunks).toEqual(["Hello there."]);
  });

  it("keeps sentence-ending punctuation attached to its sentence", () => {
    const text = "First sentence. Second sentence! Third sentence?";
    const chunks = chunkTranscript(text);
    // Short enough to stay in one chunk, but verifies no punctuation was
    // dropped or separated from its sentence during normalization/splitting.
    expect(chunks[0]).toContain("First sentence.");
    expect(chunks[0]).toContain("Second sentence!");
    expect(chunks[0]).toContain("Third sentence?");
  });

  it("splits a long transcript into multiple chunks at sentence boundaries", () => {
    // 20 sentences of ~60 chars each (~1200 chars total) — comfortably over
    // MAX_CHUNK_CHARS, so this must produce more than one chunk. Enough
    // repeats that even after the final-tiny-fragment merge step (which can
    // let the *last* chunk alone exceed MAX_CHUNK_CHARS by design), at least
    // two chunks remain.
    const sentence = "Mom told me a long story about her childhood home. ";
    const text = sentence.repeat(50).trim();

    const chunks = chunkTranscript(text);

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk boundary is a real sentence end — no sentence was cut in
    // half — and every non-final chunk stays within the max bound (only the
    // last chunk may exceed it, from absorbing a too-short trailing
    // fragment).
    chunks.forEach((chunk, i) => {
      expect(chunk.trim().endsWith(".")).toBe(true);
      if (i < chunks.length - 1) {
        expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      }
    });
    // Reassembling all chunks reproduces the original normalized text with
    // no lost or duplicated words.
    expect(chunks.join(" ")).toBe(text);
  });

  it("never emits an isolated tiny trailing fragment when more than one chunk is produced", () => {
    const sentence = "Mom told me a long story about her childhood home. ";
    const text = sentence.repeat(50).trim() + " Short tail.";

    const chunks = chunkTranscript(text);

    expect(chunks.length).toBeGreaterThan(1);
    // The final chunk absorbed the short trailing sentence rather than
    // standing alone as a fragment under MIN_CHUNK_CHARS.
    expect(chunks[chunks.length - 1]).toContain("Short tail.");
  });

  it("splits a single run-on sentence with no punctuation once it exceeds the max chunk size", () => {
    const longRunOn = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkTranscript(longRunOn);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
    // No word was dropped or duplicated by the word-boundary fallback split.
    expect(chunks.join(" ")).toBe(longRunOn);
  });

  it("is deterministic — identical input always produces an identical, ordered output", () => {
    const sentence = "Mom told me a long story about her childhood home. ";
    const text = sentence.repeat(15).trim();

    const first = chunkTranscript(text);
    const second = chunkTranscript(text);

    expect(second).toEqual(first);
  });

  it("does not produce chunks smaller than a single short transcript just because MIN_CHUNK_CHARS is unmet", () => {
    const text = "Hi.";
    expect(chunkTranscript(text)).toEqual(["Hi."]);
  });
});
