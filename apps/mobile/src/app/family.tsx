import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Family } from '@/shared/api-client/api';
import { useAuthStore } from '@/features/auth/auth-store';

export default function FamilyScreen(){
 const token=useAuthStore(s=>s.token)!; const [items,setItems]=useState<Family[]>([]); const [name,setName]=useState(''); const [loading,setLoading]=useState(true);
 const load=async()=>{try{setItems(await api.families(token));}finally{setLoading(false);}}; useEffect(()=>{load();},[]);
 const create=async()=>{if(!name.trim())return;await api.createFamily(token,name.trim());setName('');await load();};
 return <SafeAreaView style={s.safe}><Text style={s.title}>Your family spaces</Text><Text style={s.sub}>Private places where your family's memories live.</Text><View style={s.row}><TextInput style={s.input} placeholder="Family name" value={name} onChangeText={setName}/><Pressable style={s.add} onPress={create}><Text style={s.addText}>Add</Text></Pressable></View>
 {loading?<ActivityIndicator/>:<FlatList data={items} keyExtractor={x=>x.id} contentContainerStyle={{gap:12}} renderItem={({item})=><View style={s.card}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.meta}>Family space • Owner</Text></View>}/>}</SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F3EC',padding:22,gap:14},title:{fontSize:30,fontWeight:'800',color:'#211B17'},sub:{color:'#74675E',fontSize:16},row:{flexDirection:'row',gap:8},input:{flex:1,backgroundColor:'#fff',borderRadius:14,padding:14,borderWidth:1,borderColor:'#DED6CF'},add:{backgroundColor:'#6B5545',borderRadius:14,paddingHorizontal:20,justifyContent:'center'},addText:{color:'#fff',fontWeight:'800'},card:{backgroundColor:'#fff',borderRadius:18,padding:18},cardTitle:{fontSize:18,fontWeight:'800',color:'#211B17'},meta:{color:'#8A7B70',marginTop:5}});
