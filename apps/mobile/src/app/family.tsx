import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Family } from '@/shared/api-client/api';
import { useAuthGuard } from '@/features/auth/use-auth-guard';

export default function FamilyScreen(){
 const {token,ready}=useAuthGuard(); const [items,setItems]=useState<Family[]>([]); const [name,setName]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const load=async()=>{if(!token)return;try{setItems(await api.families(token));setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load family spaces');}finally{setLoading(false);}};
 // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- `load` is a plain closure recreated every render; the try/catch setState only fires async on resolution/rejection, not synchronously within the effect.
 useEffect(()=>{if(ready)load();},[ready]);
 const create=async()=>{if(!token||!name.trim())return;try{await api.createFamily(token,name.trim());setName('');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to create family');}};
 if(!ready)return <View style={s.loading}><ActivityIndicator/></View>;
 return <SafeAreaView style={s.safe}><Pressable style={s.back} onPress={()=>router.replace('/' as any)}><Text style={s.backText}>‹ Home</Text></Pressable><Text style={s.title}>Your family spaces</Text><Text style={s.sub}>Private places where your family&apos;s memories live.</Text><View style={s.row}><TextInput style={s.input} placeholder="Family name" value={name} onChangeText={setName}/><Pressable style={s.add} onPress={create}><Text style={s.addText}>Add</Text></Pressable></View>{!!error&&<Text style={s.error}>{error}</Text>}
 {loading?<ActivityIndicator/>:<FlatList data={items} keyExtractor={x=>x.id} contentContainerStyle={{gap:12}} renderItem={({item})=><View style={s.card}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.meta}>Family space • Owner</Text></View>}/>}</SafeAreaView>;
}
const s=StyleSheet.create({loading:{flex:1,justifyContent:'center'},safe:{flex:1,backgroundColor:'#F7F3EC',padding:22,gap:14},back:{alignSelf:'flex-start',paddingVertical:8,paddingRight:16},backText:{fontSize:17,fontWeight:'700',color:'#6B5545'},title:{fontSize:30,fontWeight:'800',color:'#211B17'},sub:{color:'#74675E',fontSize:16},row:{flexDirection:'row',gap:8},input:{flex:1,backgroundColor:'#fff',borderRadius:14,padding:14,borderWidth:1,borderColor:'#DED6CF'},add:{backgroundColor:'#6B5545',borderRadius:14,paddingHorizontal:20,justifyContent:'center'},addText:{color:'#fff',fontWeight:'800'},error:{color:'#B42318'},card:{backgroundColor:'#fff',borderRadius:18,padding:18},cardTitle:{fontSize:18,fontWeight:'800',color:'#211B17'},meta:{color:'#8A7B70',marginTop:5}});
