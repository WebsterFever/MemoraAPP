import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Memory } from '@/shared/api-client/api';
import { useAuthGuard } from '@/features/auth/use-auth-guard';

type ChatItem = { id: string; side: 'me' | 'person'; text: string; memory?: Memory };

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9À-ÿ]+/i).filter(word => word.length > 2);
}

export default function PersonChat() {
  const { profileId, familyId, name = 'Memory profile' } = useLocalSearchParams<{ profileId: string; familyId: string; name: string }>();
  const { token, ready } = useAuthGuard();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  const personMemories = useMemo(
    () => memories.filter(memory => memory.profileId === profileId),
    [memories, profileId],
  );

  const load = async () => {
    if (!token || !familyId) return;
    try {
      setMemories(await api.memories(token, familyId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (ready) void load(); }, [ready, token, familyId]);

  const ask = () => {
    const question = text.trim();
    if (!question) return;
    const queryWords = words(question);
    const ranked = personMemories
      .map(memory => ({
        memory,
        score: queryWords.filter(word =>
          `${memory.title} ${memory.story}`.toLowerCase().includes(word),
        ).length,
      }))
      .sort((a, b) => b.score - a.score);
    const match = ranked.find(item => item.score > 0)?.memory;

    setMessages(current => [
      ...current,
      { id: `q-${Date.now()}`, side: 'me', text: question },
      match
        ? { id: `a-${Date.now()}`, side: 'person', text: match.story, memory: match }
        : {
            id: `a-${Date.now()}`,
            side: 'person',
            text: `I don't have a recorded memory about that yet. Add a memory for ${name} about this subject.`,
          },
    ]);
    setText('');
  };

  const playMemory = async (memory: Memory) => {
    const audio = memory.mediaAssets?.find(asset => asset.status === 'READY');
    if (!audio || !token) return;
    const { url } = await api.getPlaybackUrl(token, audio.id);
    router.push({ pathname: '/memory-audio-player' as any, params: { url, name, title: memory.title } });
  };

  if (!ready || loading) return <View style={s.loading}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable>
        <View style={s.avatar}><Text style={s.initial}>{name[0]?.toUpperCase()}</Text></View>
        <View style={s.headerText}><Text style={s.name}>{name}</Text><Text style={s.status}>{personMemories.length} memories saved</Text></View>
      </View>

      <ScrollView style={s.chat} contentContainerStyle={s.chatContent}>
        <View style={s.personBubble}>
          <Text style={s.bubbleText}>Hi. This is {name}'s memory space. Ask about something already recorded, or add a new memory and voice.</Text>
        </View>

        {messages.map(message => (
          <View key={message.id} style={message.side === 'me' ? s.myBubble : s.personBubble}>
            <Text style={s.bubbleText}>{message.text}</Text>
            {message.memory?.mediaAssets?.some(asset => asset.status === 'READY') && (
              <Pressable style={s.voiceButton} onPress={() => void playMemory(message.memory!)}>
                <Text style={s.voiceText}>▶ Play {name}'s recorded voice</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={s.memoryActions}>
        <Pressable
          style={s.addMemory}
          onPress={() => router.push({ pathname: '/memory-form' as any, params: { familyId, profileId } })}
        >
          <Text style={s.addMemoryText}>＋ Add memory for {name}</Text>
        </Pressable>
        <Pressable
          style={s.viewMemories}
          onPress={() => router.push({ pathname: '/memories' as any, params: { familyId, profileId } })}
        >
          <Text style={s.viewMemoriesText}>View memories</Text>
        </Pressable>
      </View>

      <View style={s.composer}>
        <TextInput
          style={s.input}
          placeholder={`Ask ${name} something…`}
          value={text}
          onChangeText={setText}
          onSubmitEditing={ask}
          returnKeyType="send"
        />
        <Pressable style={s.send} onPress={ask}><Text style={s.sendText}>➤</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  loading:{flex:1,justifyContent:'center'},safe:{flex:1,backgroundColor:'#EFEAE2'},
  header:{height:70,backgroundColor:'#F7F3EC',paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:'#DDD3CA'},
  back:{fontSize:36,color:'#5D493B'},avatar:{width:44,height:44,borderRadius:22,backgroundColor:'#E2D4C8',alignItems:'center',justifyContent:'center'},initial:{fontSize:19,fontWeight:'900',color:'#5D493B'},headerText:{flex:1},name:{fontSize:18,fontWeight:'900',color:'#211B17'},status:{fontSize:12,color:'#81736A'},
  chat:{flex:1},chatContent:{padding:14,gap:9},personBubble:{alignSelf:'flex-start',maxWidth:'84%',backgroundColor:'#fff',borderRadius:16,borderTopLeftRadius:4,padding:12},myBubble:{alignSelf:'flex-end',maxWidth:'84%',backgroundColor:'#E7F2DF',borderRadius:16,borderTopRightRadius:4,padding:12},bubbleText:{fontSize:16,lineHeight:22,color:'#29231F'},voiceButton:{marginTop:10,paddingVertical:8,paddingHorizontal:10,backgroundColor:'#F4EEE8',borderRadius:10},voiceText:{color:'#5D493B',fontWeight:'800'},
  memoryActions:{flexDirection:'row',gap:8,paddingHorizontal:10,paddingTop:8,backgroundColor:'#F7F3EC'},addMemory:{flex:1,backgroundColor:'#5D493B',padding:11,borderRadius:12,alignItems:'center'},addMemoryText:{color:'#fff',fontWeight:'800',fontSize:13},viewMemories:{padding:11,borderRadius:12,borderWidth:1,borderColor:'#D2C5BA'},viewMemoriesText:{color:'#5D493B',fontWeight:'800',fontSize:13},
  composer:{flexDirection:'row',alignItems:'center',gap:8,padding:10,backgroundColor:'#F7F3EC'},input:{flex:1,backgroundColor:'#fff',borderRadius:22,paddingHorizontal:16,paddingVertical:11,fontSize:16},send:{width:44,height:44,borderRadius:22,backgroundColor:'#5D493B',alignItems:'center',justifyContent:'center'},sendText:{color:'#fff',fontSize:20,fontWeight:'900'},
});