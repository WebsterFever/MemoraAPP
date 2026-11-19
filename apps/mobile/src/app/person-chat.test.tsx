import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError, type AskAnswer, type Memory, type MemoryProfile } from '@/shared/api-client/api';
import PersonChat from './person-chat';

// Every jest.fn() referenced by a mock factory must be created *inside* that
// factory (or be a `require()`d module-local, like `react` below) — ESM
// import hoisting runs each factory, on first require, before any outer
// `const mockX = jest.fn()` in this file gets assigned, so closing over an
// outer mock variable silently captures `undefined` instead of the fn.
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({ seekTo: jest.fn(), play: jest.fn() })),
  useAudioPlayerStatus: jest.fn(() => ({ isLoaded: true })),
}));

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over outer imports
  const { useEffect } = require('react');
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useLocalSearchParams: () => ({ profileId: 'profile-1', familyId: 'family-1', name: 'Mom' }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

jest.mock('@/features/auth/use-auth-guard', () => ({
  useAuthGuard: () => ({ token: 'test-token', ready: true }),
}));

jest.mock('@/shared/api-client/api', () => {
  const actual = jest.requireActual('@/shared/api-client/api');
  return {
    ...actual,
    api: {
      memories: jest.fn(),
      profiles: jest.fn(),
      ask: jest.fn(),
      getPlaybackUrl: jest.fn(),
    },
  };
});

// Safe to read *after* the mocked module has been imported above — these
// are just property reads off the already-constructed mock object, not
// references captured inside a factory.
const mockMemories = api.memories as jest.Mock;
const mockProfiles = api.profiles as jest.Mock;
const mockAsk = api.ask as jest.Mock;
const mockGetPlaybackUrl = api.getPlaybackUrl as jest.Mock;

const memoryWithAudio: Memory = {
  id: 'memory-1',
  familyId: 'family-1',
  profileId: 'profile-1',
  title: 'Sunday recipe',
  story: 'Lemon rice every Sunday.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  mediaAssets: [
    { id: 'asset-1', familyId: 'family-1', memoryId: 'memory-1', uploadedByUserId: 'user-1', type: 'AUDIO', storageProvider: 'S3', mimeType: 'audio/mp4', status: 'READY', createdAt: '', updatedAt: '' },
  ],
};

function profileWithLanguage(preferredLanguage: string): MemoryProfile {
  return { id: 'profile-1', familyId: 'family-1', displayName: 'Mom', preferredLanguage, spokenLanguages: [preferredLanguage], status: 'ACTIVE' };
}

function answer(overrides: Partial<AskAnswer> = {}): AskAnswer {
  return {
    refused: false,
    refusalReason: null,
    answer: 'She made lemon rice every Sunday.',
    citations: [{ chunkId: 'chunk-1', memoryId: 'memory-1', memorySourceId: 'source-1', quotedText: 'Lemon rice every Sunday.' }],
    conversationLanguage: 'en',
    isGenerated: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemories.mockResolvedValue([memoryWithAudio]);
  mockProfiles.mockResolvedValue([profileWithLanguage('en')]);
});

async function renderChat() {
  render(<PersonChat />);
  await waitFor(() => expect(screen.getByPlaceholderText('Message Mom')).toBeTruthy());
}

describe('PersonChat', () => {
  it('shows the WhatsApp-style greeting and the profile memory count', async () => {
    await renderChat();
    expect(screen.getByText(/Mom's memory space/)).toBeTruthy();
    expect(screen.getByText('1 memory saved')).toBeTruthy();
  });

  it('sends a question, shows a pending indicator, then renders the AI answer labeled as generated, with a citation chip', async () => {
    mockAsk.mockResolvedValue(answer());
    await renderChat();

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'What was her favorite recipe?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    expect(screen.getByText('What was her favorite recipe?')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('She made lemon rice every Sunday.')).toBeTruthy());
    expect(screen.getByText('✨ Generated from recorded memories')).toBeTruthy();
    expect(screen.getByText('▶ Sunday recipe')).toBeTruthy();

    expect(mockAsk).toHaveBeenCalledWith('test-token', 'family-1', 'profile-1', 'What was her favorite recipe?', 'en');
  });

  it('never presents a generated answer as a direct quotation — it always carries the generated label', async () => {
    mockAsk.mockResolvedValue(answer({ answer: 'He always said patience saves time.', citations: [] }));
    await renderChat();

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'What advice did he give?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(screen.getByText('He always said patience saves time.')).toBeTruthy());
    expect(screen.getByText('✨ Generated from recorded memories')).toBeTruthy();
  });

  it('shows a friendly refusal message and never exposes the internal refusal reason', async () => {
    mockAsk.mockResolvedValue(answer({ refused: true, refusalReason: 'FABRICATED_CITATION', answer: null, citations: [] }));
    await renderChat();

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'Something unrelated');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(screen.getByText(/couldn't find anything in Mom's recorded memories/)).toBeTruthy());
    expect(screen.queryByText(/FABRICATED_CITATION/)).toBeNull();
  });

  it('shows a friendly network-error message with a retry action, and retry resends the same question', async () => {
    mockAsk.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(answer());
    await renderChat();

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'What was her favorite recipe?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(screen.getByText(/couldn't reach Memora/)).toBeTruthy());

    fireEvent.press(screen.getByText('↻ Retry'));

    await waitFor(() => expect(screen.getByText('She made lemon rice every Sunday.')).toBeTruthy());
    expect(mockAsk).toHaveBeenCalledTimes(2);
    expect(mockAsk).toHaveBeenNthCalledWith(2, 'test-token', 'family-1', 'profile-1', 'What was her favorite recipe?', 'en');
  });

  it('shows a friendly rate-limit message on HTTP 429, distinct from the generic network error', async () => {
    mockAsk.mockRejectedValue(new ApiError('Too Many Requests', 429));
    await renderChat();

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'What was her favorite recipe?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(screen.getByText(/getting a lot of questions/)).toBeTruthy());
  });

  it('prevents a duplicate submission while a request is already in flight', async () => {
    let resolveAsk: (value: AskAnswer) => void = () => {};
    mockAsk.mockImplementation(() => new Promise((resolve) => { resolveAsk = resolve; }));
    await renderChat();

    const input = screen.getByPlaceholderText('Message Mom');
    fireEvent.changeText(input, 'What was her favorite recipe?');
    fireEvent(input, 'submitEditing');
    // A second rapid submit while the first is still pending must not fire
    // a second request — the composer text was already cleared, but a
    // stray extra Enter/press shouldn't double-send.
    fireEvent(input, 'submitEditing');

    expect(mockAsk).toHaveBeenCalledTimes(1);
    resolveAsk(answer());
    await waitFor(() => expect(screen.getByText('She made lemon rice every Sunday.')).toBeTruthy());
  });

  it('defaults the conversation language to the profile preferredLanguage when supported', async () => {
    mockProfiles.mockResolvedValue([profileWithLanguage('fr')]);
    mockAsk.mockResolvedValue(answer());
    await renderChat();

    await waitFor(() => expect(screen.getByText('FR')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'Quelle était sa recette préférée ?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith('test-token', 'family-1', 'profile-1', 'Quelle était sa recette préférée ?', 'fr'));
  });

  it('falls back to English when the profile preferredLanguage is unsupported', async () => {
    mockProfiles.mockResolvedValue([profileWithLanguage('xx')]);
    await renderChat();
    await waitFor(() => expect(screen.getByText('EN')).toBeTruthy());
  });

  it('lets the user change the conversation language from the picker, and uses it on the next question', async () => {
    mockAsk.mockResolvedValue(answer());
    await renderChat();

    fireEvent.press(screen.getByLabelText('Change conversation language'));
    fireEvent.press(screen.getByText('Kreyòl Ayisyen'));

    await waitFor(() => expect(screen.getByText('HT')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'Ki resèt li te konn fè?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith('test-token', 'family-1', 'profile-1', 'Ki resèt li te konn fè?', 'ht'));
  });

  it('plays the cited memory recording through the existing audio playback wiring (regression)', async () => {
    mockAsk.mockResolvedValue(answer());
    mockGetPlaybackUrl.mockResolvedValue({ url: 'https://example.com/audio.mp4' });
    await renderChat();

    fireEvent.changeText(screen.getByPlaceholderText('Message Mom'), 'What was her favorite recipe?');
    fireEvent(screen.getByPlaceholderText('Message Mom'), 'submitEditing');

    await waitFor(() => expect(screen.getByText('▶ Sunday recipe')).toBeTruthy());
    fireEvent.press(screen.getByText('▶ Sunday recipe'));

    // Confirms the existing playMemory() wiring (unchanged by this
    // checkpoint) still fires correctly from a citation chip tap — the
    // actual native seekTo()/play() calls are expo-audio bridge behavior,
    // already covered by that library's own tests, not re-asserted here.
    await waitFor(() => expect(mockGetPlaybackUrl).toHaveBeenCalledWith('test-token', 'asset-1'));
  });
});
