import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '@memora/shared';
import { api, ApiError, type AskCitation, type Memory } from '@/shared/api-client/api';
import { useAuthGuard } from '@/features/auth/use-auth-guard';
import { LanguagePickerModal } from '@/shared/language/language-picker-modal';

type ChatItem =
  | { id: string; side: 'me'; text: string }
  | { id: string; side: 'pending' }
  | { id: string; side: 'answer'; text: string; citations: AskCitation[] }
  | { id: string; side: 'refusal'; text: string }
  | { id: string; side: 'error'; text: string; retry: { question: string; conversationLanguage: SupportedLanguage } };

export default function PersonChat() {
  const { profileId, familyId, name = 'Memory profile' } = useLocalSearchParams<{ profileId: string; familyId: string; name: string }>();
  const { token, ready } = useAuthGuard();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationLanguage, setConversationLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const player = useAudioPlayer(playbackUrl ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const scrollRef = useRef<ScrollView>(null);
  const languageInitialized = useRef(false);
  // Date.now()/crypto.randomUUID() are impure and flagged by
  // react-hooks/purity even inside a plain event-handler function defined in
  // component scope — a monotonic ref counter is the sanctioned pure
  // alternative for generating unique message ids.
  const idCounterRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${idCounterRef.current++}`;

  const personMemories = useMemo(
    () => memories.filter(memory => memory.profileId === profileId),
    [memories, profileId],
  );

  const load = useCallback(async () => {
    if (!token || !familyId) return;
    try {
      setMemories(await api.memories(token, familyId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token, familyId]);

  // Refresh every time the chat regains focus. This is important after
  // creating a memory or uploading its audio and navigating back here.
  useFocusEffect(useCallback(() => {
    if (ready) void load();
  }, [ready, load]));

  // Default the conversation language from the profile's preferredLanguage
  // exactly once per screen visit — never on every refocus, or a manual
  // in-chat language change would get silently reverted when the user comes
  // back from "Add memory". Persistent, cross-screen language preferences
  // are Checkpoint 5 (Settings → Language); this is intentionally local.
  useEffect(() => {
    if (!token || !familyId || !profileId || languageInitialized.current) return;
    languageInitialized.current = true;
    void (async () => {
      try {
        const profiles = await api.profiles(token, familyId);
        const profile = profiles.find(p => p.id === profileId);
        if (profile && isSupportedLanguage(profile.preferredLanguage)) {
          setConversationLanguage(profile.preferredLanguage);
        }
      } catch {
        // Keep the default language if the profile request fails.
        // Chat remains usable and the user can choose a language manually.
      }
    })();
  }, [token, familyId, profileId]);

  const friendlyRefusalText = () =>
    personMemories.length
      ? `I couldn't find anything in ${name}'s recorded memories that answers that.`
      : `I don't have a recorded memory about that yet. Add a memory for ${name} about this subject.`;

  const scrollSoon = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  // Shared by both a fresh question and a retry — always resolves by
  // overwriting the message at `slotId` exactly once, whether that slot was
  // just created (ask) or is being reused (retryItem).
  const runAsk = (question: string, language: SupportedLanguage, slotId: string) => {
    if (!token || !familyId || !profileId) return;
    setSending(true);
    void (async () => {
      try {
        const result = await api.ask(token, familyId, profileId, question, language);
        setMessages(current =>
          current.map(item =>
            item.id !== slotId
              ? item
              : result.refused
                ? { id: slotId, side: 'refusal', text: friendlyRefusalText() }
                : { id: slotId, side: 'answer', text: result.answer ?? '', citations: result.citations },
          ),
        );
      } catch (error) {
        const message =
          error instanceof ApiError && error.status === 429
            ? "I'm getting a lot of questions right now. Please wait a moment and try again."
            : "I couldn't reach Memora. Check your connection and try again.";
        setMessages(current =>
          current.map(item =>
            item.id === slotId
              ? { id: slotId, side: 'error', text: message, retry: { question, conversationLanguage: language } }
              : item,
          ),
        );
      } finally {
        setSending(false);
        scrollSoon();
      }
    })();
  };

  const ask = () => {
    const question = text.trim();
    if (!question || sending) return;
    setText('');
    const slotId = nextId('slot');
    setMessages(current => [...current, { id: nextId('q'), side: 'me', text: question }, { id: slotId, side: 'pending' }]);
    scrollSoon();
    runAsk(question, conversationLanguage, slotId);
  };

  const retryItem = (item: Extract<ChatItem, { side: 'error' }>) => {
    if (sending) return;
    setMessages(current => current.map(m => (m.id === item.id ? { id: item.id, side: 'pending' } : m)));
    scrollSoon();
    runAsk(item.retry.question, item.retry.conversationLanguage, item.id);
  };

  const playMemory = async (memory: Memory) => {
    const audio = memory.mediaAssets?.find(asset => asset.type === 'AUDIO' && asset.status === 'READY');
    if (!audio || !token) return;
    const { url } = await api.getPlaybackUrl(token, audio.id);
    // Updating the source is asynchronous in expo-audio. Playback is started
    // by the effect below only after the native player has loaded the new URL.
    setPlaybackUrl(url);
  };

  useEffect(() => {
    if (!playbackUrl || !playerStatus.isLoaded) return;
    player.seekTo(0);
    player.play();
  }, [playbackUrl, playerStatus.isLoaded, player]);

  if (!ready || loading) return <View style={s.loading}><ActivityIndicator /></View>;

  if (loadError) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loadError}>
          <Text style={s.bubbleText}>Couldn't load memories. Check your connection and try again.</Text>
          <Pressable style={s.addMemory} onPress={() => { setLoading(true); void load(); }}>
            <Text style={s.addMemoryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable>
          <View style={s.avatar}><Text style={s.initial}>{name[0]?.toUpperCase()}</Text></View>
          <View style={s.headerText}>
            <Text style={s.name}>{name}</Text>
            <Text style={s.status}>{personMemories.length} {personMemories.length === 1 ? 'memory' : 'memories'} saved</Text>
          </View>
          <Pressable
            style={s.languagePill}
            onPress={() => setLanguagePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change conversation language"
          >
            <Text style={s.languagePillText}>{conversationLanguage.toUpperCase()}</Text>
          </Pressable>
        </View>

        <LanguagePickerModal
          visible={languagePickerVisible}
          selectedCode={conversationLanguage}
          onSelect={setConversationLanguage}
          onClose={() => setLanguagePickerVisible(false)}
        />

        <ScrollView
          ref={scrollRef}
          style={s.chat}
          contentContainerStyle={s.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <View style={s.personBubble}>
            <Text style={s.bubbleText}>Hi. This is {name}&apos;s memory space. Ask about something already recorded, or add a new memory and voice.</Text>
          </View>
          {messages.map(message => {
            if (message.side === 'me') {
              return (
                <View key={message.id} style={s.myBubble}>
                  <Text style={s.bubbleText}>{message.text}</Text>
                </View>
              );
            }

            if (message.side === 'pending') {
              return (
                <View key={message.id} style={[s.personBubble, s.pendingBubble]}>
                  <ActivityIndicator size="small" color="#5D493B" />
                </View>
              );
            }

            if (message.side === 'error') {
              return (
                <View key={message.id} style={s.personBubble}>
                  <Text style={s.bubbleText}>{message.text}</Text>
                  <Pressable style={s.voiceButton} onPress={() => retryItem(message)}>
                    <Text style={s.voiceText}>↻ Retry</Text>
                  </Pressable>
                </View>
              );
            }

            if (message.side === 'refusal') {
              return (
                <View key={message.id} style={s.personBubble}>
                  <Text style={s.bubbleText}>{message.text}</Text>
                </View>
              );
            }

            return (
              <View key={message.id} style={s.personBubble}>
                <Text style={s.generatedLabel}>✨ Generated from recorded memories</Text>
                <Text style={s.bubbleText}>{message.text}</Text>
                {message.citations.length > 0 && (
                  <View style={s.citationRow}>
                    {message.citations.map(citation => {
                      const memory = memories.find(m => m.id === citation.memoryId);
                      const hasAudio = memory?.mediaAssets?.some(asset => asset.status === 'READY');
                      return (
                        <Pressable
                          key={citation.chunkId}
                          style={s.citationChip}
                          onPress={() => hasAudio && memory && void playMemory(memory)}
                        >
                          <Text style={s.citationChipText}>
                            {hasAudio ? `▶ ${memory!.title}` : `📖 ${memory?.title ?? 'Memory'}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={s.memoryActions}>
          <Pressable style={s.addMemory} onPress={() => router.push({ pathname: '/memory-form' as any, params: { familyId, profileId } })}>
            <Text style={s.addMemoryText}>＋ Add memory for {name}</Text>
          </Pressable>
          <Pressable style={s.viewMemories} onPress={() => router.push({ pathname: '/memories' as any, params: { familyId, profileId } })}>
            <Text style={s.viewMemoriesText}>Memories</Text>
          </Pressable>
        </View>

        <View style={s.composer}>
          <TextInput
            style={s.input}
            placeholder={`Message ${name}`}
            placeholderTextColor="#8A817A"
            value={text}
            onChangeText={setText}
            onSubmitEditing={ask}
            returnKeyType="send"
            selectionColor="#5D493B"
            editable={!sending}
          />
          <Pressable style={[s.send, sending && s.sendDisabled]} onPress={ask} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.sendText}>➤</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  loading:{flex:1,justifyContent:'center'},loadError:{flex:1,justifyContent:'center',alignItems:'center',padding:24,gap:16},safe:{flex:1,backgroundColor:'#EFEAE2'},flex:{flex:1},
  header:{height:70,backgroundColor:'#F7F3EC',paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:'#DDD3CA'},
  back:{fontSize:36,color:'#5D493B'},avatar:{width:44,height:44,borderRadius:22,backgroundColor:'#E2D4C8',alignItems:'center',justifyContent:'center'},initial:{fontSize:19,fontWeight:'900',color:'#5D493B'},headerText:{flex:1},name:{fontSize:18,fontWeight:'900',color:'#211B17'},status:{fontSize:12,color:'#81736A'},
  languagePill:{paddingHorizontal:10,paddingVertical:6,borderRadius:12,backgroundColor:'#E2D4C8'},languagePillText:{fontSize:12,fontWeight:'900',color:'#5D493B'},
  chat:{flex:1},chatContent:{padding:14,gap:9,paddingBottom:18},personBubble:{alignSelf:'flex-start',maxWidth:'84%',backgroundColor:'#fff',borderRadius:16,borderTopLeftRadius:4,padding:12},myBubble:{alignSelf:'flex-end',maxWidth:'84%',backgroundColor:'#E7F2DF',borderRadius:16,borderTopRightRadius:4,padding:12},bubbleText:{fontSize:16,lineHeight:22,color:'#29231F'},pendingBubble:{paddingVertical:14,paddingHorizontal:18},
  generatedLabel:{fontSize:11,fontWeight:'800',color:'#9A8C7E',marginBottom:4},
  citationRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:10},citationChip:{paddingVertical:7,paddingHorizontal:10,backgroundColor:'#F4EEE8',borderRadius:10},citationChipText:{color:'#5D493B',fontWeight:'700',fontSize:12},
  voiceButton:{marginTop:10,paddingVertical:8,paddingHorizontal:10,backgroundColor:'#F4EEE8',borderRadius:10},voiceText:{color:'#5D493B',fontWeight:'800'},
  memoryActions:{flexDirection:'row',gap:8,paddingHorizontal:10,paddingTop:8,backgroundColor:'#F7F3EC'},addMemory:{flex:1,backgroundColor:'#5D493B',padding:11,borderRadius:12,alignItems:'center'},addMemoryText:{color:'#fff',fontWeight:'800',fontSize:13},viewMemories:{padding:11,borderRadius:12,borderWidth:1,borderColor:'#D2C5BA'},viewMemoriesText:{color:'#5D493B',fontWeight:'800',fontSize:13},
  composer:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,paddingTop:8,paddingBottom:10,backgroundColor:'#F7F3EC'},input:{flex:1,minHeight:46,backgroundColor:'#fff',color:'#211B17',borderRadius:23,paddingHorizontal:16,paddingVertical:11,fontSize:16,borderWidth:1,borderColor:'#E1D8D0'},send:{width:46,height:46,borderRadius:23,backgroundColor:'#5D493B',alignItems:'center',justifyContent:'center'},sendDisabled:{opacity:0.5},sendText:{color:'#fff',fontSize:20,fontWeight:'900'},
});
