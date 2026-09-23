import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { api, Memory } from '@/shared/api-client/api';
import { useAuthGuard } from '@/features/auth/use-auth-guard';
import { confirmDestructive } from '@/shared/ui/confirm';

function AudioMemoryPlayer({ token, mediaAssetId }: { token: string; mediaAssetId: string }) {
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{api.getPlaybackUrl(token,mediaAssetId).then(r=>setUrl(r.url)).catch(()=>{});},[token,mediaAssetId]);
 const player=useAudioPlayer(url??undefined); const status=useAudioPlayerStatus(player);
 if(!url)return <ActivityIndicator/>;
 return <Pressable style={s.playButton} onPress={()=>status.playing?player.pause():player.play()}><Text style={s.playButtonText}>{status.playing?'⏸ Pause voice memory':'▶ Play voice memory'}</Text></Pressable>;
}

export default function MemoryDetail(){
 const {id,familyId}=useLocalSearchParams<{id:string;familyId:string}>(); const {token,ready}=useAuthGuard();
 const [memory,setMemory]=useState<Memory|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 useEffect(()=>{if(!ready||!token||!familyId)return;api.memories(token,familyId).then(xs=>setMemory(xs.find(x=>x.id===id)??null)).catch(e=>setError(e instanceof Error?e.message:'Unable to load memory')).finally(()=>setLoading(false));},[ready,id,familyId,token]);
 const remove=async()=>{if(!token||!id)return;const confirmed=await confirmDestructive('Delete memory?',"This action can't be undone.");if(!confirmed)return;try{await api.deleteMemory(token,id);router.replace('/memories' as any);}catch(e){setError(e instanceof Error?e.message:'Unable to delete memory');}};
 if(!ready||loading)return <View style={s.loading}><ActivityIndicator/></View>;
 if(!memory)return <SafeAreaView style={s.safe}><Pressable onPress={()=>router.replace('/memories' as any)}><Text style={s.back}>‹ Memories</Text></Pressable><Text style={s.title}>{error||'Memory not found'}</Text></SafeAreaView>;
 const readyAudio=memory.mediaAssets?.find(a=>a.type==='AUDIO'&&a.status==='READY');
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}><Pressable onPress={()=>router.replace('/memories' as any)}><Text style={s.back}>‹ Memories</Text></Pressable><Text style={s.date}>{memory.occurredAt?new Date(memory.occurredAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):'Date not set'}</Text><Text style={s.title}>{memory.title}</Text>{memory.profile&&<Text style={s.person}>Remembering {memory.profile.displayName}</Text>}<View style={s.storyCard}><Text style={s.story}>{memory.story}</Text></View>{!!error&&<Text style={s.error}>{error}</Text>}{token&&readyAudio&&<AudioMemoryPlayer token={token} mediaAssetId={readyAudio.id}/>}<Pressable style={s.record} onPress={()=>router.push({pathname:'/memory-audio' as any,params:{id:memory.id,familyId:memory.familyId}})}><Text style={s.recordText}>{readyAudio?'Record a new voice memory':'🎙 Record voice memory'}</Text></Pressable><View style={s.actions}><Pressable style={s.edit} onPress={()=>router.push({pathname:'/memory-edit' as any,params:{id:memory.id,familyId:memory.familyId}})}><Text style={s.editText}>Edit memory</Text></Pressable><Pressable style={s.delete} onPress={remove}><Text style={s.deleteText}>Delete</Text></Pressable></View></ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({loading:{flex:1,justifyContent:'center'},safe:{flex:1,backgroundColor:'#F7F3EC'},content:{padding:22,gap:14,paddingBottom:50},back:{fontSize:17,fontWeight:'700',color:'#6B5545'},date:{fontSize:13,fontWeight:'800',color:'#9A7D67',marginTop:12},title:{fontSize:34,lineHeight:40,fontWeight:'800',color:'#211B17'},person:{fontSize:16,fontWeight:'700',color:'#6B5545'},storyCard:{backgroundColor:'#fff',padding:22,borderRadius:22,marginTop:5},story:{fontSize:17,lineHeight:28,color:'#443A34'},error:{color:'#B42318'},playButton:{backgroundColor:'#fff',padding:16,borderRadius:14,alignItems:'center',borderWidth:1,borderColor:'#DED6CF'},playButtonText:{color:'#443A34',fontWeight:'800'},record:{backgroundColor:'#fff',padding:16,borderRadius:14,alignItems:'center',borderWidth:1,borderColor:'#DED6CF'},recordText:{color:'#6B5545',fontWeight:'800'},actions:{flexDirection:'row',gap:10,marginTop:6},edit:{flex:1,backgroundColor:'#6B5545',padding:15,borderRadius:14,alignItems:'center'},editText:{color:'#fff',fontWeight:'800'},delete:{paddingHorizontal:20,paddingVertical:15,borderRadius:14,borderWidth:1,borderColor:'#D8B4AE'},deleteText:{color:'#B42318',fontWeight:'800'}});