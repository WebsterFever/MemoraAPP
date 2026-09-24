import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Family, MemoryProfile } from '@/shared/api-client/api';
import { useAuthStore } from '@/features/auth/auth-store';

type Person = MemoryProfile & { familyName: string };

export default function Home() {
  const { token, user, hydrated, signOut } = useAuthStore();
  const [families, setFamilies] = useState<Family[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !token) {
      router.replace('/login' as any);
      return;
    }
    if (!token) return;

    (async () => {
      try {
        const fs = await api.families(token);
        setFamilies(fs);
        const groups = await Promise.all(
          fs.map(async family =>
            (await api.profiles(token, family.id)).map(profile => ({
              ...profile,
              familyName: family.name,
            })),
          ),
        );
        setPeople(groups.flat());
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, token]);

  if (!hydrated || !token) return <View style={s.loading}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.brand}>Memora</Text>
          <Text style={s.subtitle}>Your people, their voices, their stories</Text>
        </View>
        <Pressable onPress={async () => { await signOut(); router.replace('/login' as any); }}>
          <Text style={s.logout}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.toolbar}>
          <Pressable style={s.addButton} onPress={() => router.push('/profiles' as any)}>
            <Text style={s.addButtonText}>＋ Add person</Text>
          </Pressable>
          <Pressable style={s.familyButton} onPress={() => router.push('/family' as any)}>
            <Text style={s.familyButtonText}>Family spaces</Text>
          </Pressable>
        </View>

        <Text style={s.section}>Chats</Text>
        {loading ? <ActivityIndicator /> : people.length === 0 ? (
          <Pressable style={s.empty} onPress={() => router.push('/profiles' as any)}>
            <Text style={s.emptyTitle}>Add someone you want to remember</Text>
            <Text style={s.emptyText}>For example: Hélène. Then open her conversation to save her memories and voice.</Text>
          </Pressable>
        ) : people.map(person => (
          <Pressable
            key={person.id}
            style={s.person}
            onPress={() => router.push({
              pathname: '/person-chat' as any,
              params: { profileId: person.id, familyId: person.familyId, name: person.displayName },
            })}
          >
            <View style={s.avatar}><Text style={s.initial}>{person.displayName[0]?.toUpperCase()}</Text></View>
            <View style={s.personBody}>
              <View style={s.personTop}>
                <Text style={s.personName}>{person.displayName}</Text>
                <Text style={s.chevron}>›</Text>
              </View>
              <Text style={s.preview}>Open memories and talk with {person.displayName}</Text>
              <Text style={s.family}>{person.familyName}</Text>
            </View>
          </Pressable>
        ))}

        {families.length === 0 && (
          <Pressable style={s.empty} onPress={() => router.push('/family' as any)}>
            <Text style={s.emptyTitle}>Create your first family space</Text>
            <Text style={s.emptyText}>Create a private family space before adding people.</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  loading:{flex:1,justifyContent:'center'}, safe:{flex:1,backgroundColor:'#F7F3EC'},
  header:{paddingHorizontal:20,paddingTop:10,paddingBottom:15,borderBottomWidth:1,borderBottomColor:'#E7DED6',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brand:{fontSize:30,fontWeight:'900',color:'#5D493B'},subtitle:{fontSize:12,color:'#81736A',marginTop:2},logout:{color:'#765D4B',fontWeight:'700'},
  content:{paddingBottom:30},toolbar:{flexDirection:'row',gap:10,padding:16},addButton:{flex:1,backgroundColor:'#5D493B',padding:13,borderRadius:14,alignItems:'center'},addButtonText:{color:'#fff',fontWeight:'800'},familyButton:{padding:13,borderRadius:14,borderWidth:1,borderColor:'#D8CEC5'},familyButtonText:{color:'#5D493B',fontWeight:'800'},
  section:{fontSize:15,fontWeight:'800',color:'#81736A',paddingHorizontal:20,paddingVertical:8,textTransform:'uppercase',letterSpacing:1},
  person:{backgroundColor:'#fff',paddingHorizontal:18,paddingVertical:14,flexDirection:'row',alignItems:'center',gap:13,borderBottomWidth:1,borderBottomColor:'#F0EBE6'},
  avatar:{width:56,height:56,borderRadius:28,backgroundColor:'#E9DED4',alignItems:'center',justifyContent:'center'},initial:{fontSize:22,fontWeight:'900',color:'#5D493B'},
  personBody:{flex:1},personTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},personName:{fontSize:18,fontWeight:'800',color:'#211B17'},chevron:{fontSize:28,color:'#9B8D83'},preview:{fontSize:14,color:'#74675E',marginTop:3},family:{fontSize:12,color:'#A09187',marginTop:4},
  empty:{marginHorizontal:16,marginTop:8,backgroundColor:'#fff',padding:20,borderRadius:18},emptyTitle:{fontSize:18,fontWeight:'800',color:'#211B17'},emptyText:{color:'#786A61',lineHeight:21,marginTop:6},
});