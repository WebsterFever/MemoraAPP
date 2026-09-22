import { useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/shared/api-client/api';
import { useAuthStore } from '@/features/auth/auth-store';

export default function Register() {
 const signIn=useAuthStore(s=>s.signIn); const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
 const submit=async()=>{setError('');setLoading(true);try{const r=await api.register(name.trim(),email.trim(),password);await signIn(r.accessToken,r.user);router.replace('/' as any);}catch(e){setError(e instanceof Error?e.message:'Unable to register');}finally{setLoading(false);}};
 return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
 <Pressable style={s.back} onPress={()=>router.canGoBack()?router.back():router.replace('/login' as any)}><Text style={s.backText}>‹ Back</Text></Pressable>
 <View style={s.card}><Text style={s.brand}>Memora</Text><Text style={s.title}>Create your account</Text><Text style={s.sub}>Start a private space for your family&apos;s stories.</Text>
 <TextInput style={s.input} placeholder="Your name" value={name} onChangeText={setName}/><TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/><TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>
 {!!error&&<Text style={s.error}>{error}</Text>}<Pressable style={s.button} onPress={submit} disabled={loading}>{loading?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Create account</Text>}</Pressable><Text style={s.footer}>Already have an account? <Link href={"/login" as any} style={s.link}>Sign in</Link></Text></View>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F3EC'},flex:{flex:1},content:{flexGrow:1,justifyContent:'center',padding:24},back:{alignSelf:'flex-start',paddingVertical:10,paddingRight:16,marginBottom:8},backText:{fontSize:17,fontWeight:'700',color:'#6B5545'},card:{backgroundColor:'#fff',padding:24,borderRadius:24,gap:14},brand:{fontSize:20,fontWeight:'800',color:'#5B4A3D'},title:{fontSize:30,fontWeight:'800',color:'#211B17'},sub:{fontSize:16,color:'#74675E',marginBottom:8},input:{borderWidth:1,borderColor:'#DED6CF',borderRadius:14,padding:15,fontSize:16,backgroundColor:'#FCFBF9'},button:{backgroundColor:'#6B5545',borderRadius:14,padding:16,alignItems:'center',marginTop:4},buttonText:{color:'#fff',fontWeight:'800',fontSize:16},error:{color:'#B42318'},footer:{textAlign:'center',color:'#74675E',marginTop:8},link:{color:'#6B5545',fontWeight:'800'}});