/**
 * Target chunk size bounds, in characters. A first, deliberately simple
 * slice of doc 06 stage 5 ("semantic segmentation") — sentence/length-aware
 * chunking, not topic/pause/language-switch-aware segmentation. Good enough
 * to avoid cutting mid-sentence in the common case without building more
 * than this phase needs.
 */
export const MIN_CHUNK_CHARS = 200;
export const MAX_CHUNK_CHARS = 1000;

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Splits on sentence-ending punctuation (. ! ?) followed by whitespace or
 * end-of-string, keeping the punctuation attached to the sentence it ends.
 * Deliberately simple regex heuristic, not an NLP sentence tokenizer.
 */
function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  return matches ? matches.map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * A single sentence with no punctuation break can still exceed the max
 * chunk size (e.g. a long run-on transcript segment). Falls back to
 * splitting on word boundaries so no chunk ever grows unbounded.
 */
function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const words = sentence.split(" ");
  const parts: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) {
      parts.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Deterministic, pure chunking: identical input always produces an
 * identical, ordered array of chunk texts — callers rely on this for
 * idempotent reprocessing (SegmentationService upserts by index).
 *
 * Greedily packs sentences into a chunk until adding the next one would
 * exceed MAX_CHUNK_CHARS, but never closes a chunk early while it's still
 * under MIN_CHUNK_CHARS (prevents "every sentence is its own tiny chunk").
 * A too-short trailing remainder is merged into the previous chunk rather
 * than persisted as an isolated fragment.
 */
export function chunkTranscript(rawText: string): string[] {
  const text = normalizeWhitespace(rawText);
  if (!text) return [];

  const sentences = splitIntoSentences(text).flatMap((s) => splitLongSentence(s, MAX_CHUNK_CHARS));
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && current.length >= MIN_CHUNK_CHARS && candidate.length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  const lastIndex = chunks.length - 1;
  const lastChunk = lastIndex > 0 ? chunks[lastIndex] : undefined;
  if (lastIndex > 0 && lastChunk !== undefined && lastChunk.length < MIN_CHUNK_CHARS) {
    chunks.pop();
    const newLastIndex = chunks.length - 1;
    const previousChunk = chunks[newLastIndex];
    if (previousChunk !== undefined) {
      chunks[newLastIndex] = `${previousChunk} ${lastChunk}`;
    }
  }

  return chunks;
}
