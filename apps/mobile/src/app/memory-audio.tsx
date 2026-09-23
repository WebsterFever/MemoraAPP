import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { api } from '@/shared/api-client/api';
import { useAuthGuard } from '@/features/auth/use-auth-guard';

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function MemoryAudio() {
  const { id, familyId } = useLocalSearchParams<{ id: string; familyId: string }>();
  const { token, ready } = useAuthGuard();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const player = useAudioPlayer(recordedUri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);

  const [permissionError, setPermissionError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setPermissionError('Microphone access is required to record a voice memory.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch (e) {
        setPermissionError(e instanceof Error ? e.message : 'Unable to access the microphone');
      }
    })();
  }, []);

  const startRecording = async () => {
    setUploadError('');
    setRecordedUri(null);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Unable to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      setRecordedUri(recorder.uri ?? null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Unable to stop recording');
    }
  };

  const reRecord = () => {
    setRecordedUri(null);
    setDone(false);
    setUploadError('');
  };

  const upload = async () => {
    if (!token || !id || !recordedUri) return;
    setUploading(true);
    setUploadError('');
    try {
      const fileResponse = await fetch(recordedUri);
      const blob = await fileResponse.blob();
      const mimeType = 'audio/mp4';

      const { mediaAssetId, uploadUrl } = await api.createMediaUpload(token, id, {
        mimeType,
        sizeBytes: blob.size,
        durationMs: recorderState.durationMillis,
      });

      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mimeType },
      });
      if (!putResponse.ok) throw new Error('Upload to storage failed');

      await api.completeMediaUpload(token, mediaAssetId);
      setDone(true);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Unable to upload recording');
    } finally {
      setUploading(false);
    }
  };

  if (!ready) return <View style={s.loading}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()}>
        <Text style={s.back}>‹ Back</Text>
      </Pressable>
      <Text style={s.title}>Record a voice memory</Text>

      {!!permissionError && <Text style={s.error}>{permissionError}</Text>}

      {done ? (
        <View style={s.card}>
          <Text style={s.doneTitle}>Voice memory saved</Text>
          <Text style={s.sub}>Your recording has been uploaded and attached to this memory.</Text>
          <Pressable
            style={s.primary}
            onPress={() => router.replace({ pathname: '/memory-detail' as any, params: { id, familyId } })}
          >
            <Text style={s.primaryText}>Back to memory</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.card}>
          {!recordedUri ? (
            <>
              <Text style={s.duration}>{formatDuration(recorderState.durationMillis)}</Text>
              <Text style={s.sub}>{recorderState.isRecording ? 'Recording…' : 'Ready to record'}</Text>
              <Pressable
                style={[s.recordButton, recorderState.isRecording && s.recordButtonActive]}
                onPress={recorderState.isRecording ? stopRecording : startRecording}
                disabled={!!permissionError}
              >
                <Text style={s.recordButtonText}>{recorderState.isRecording ? 'Stop' : 'Record'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.sub}>Review your recording</Text>
              <Text style={s.duration}>{formatDuration(playerStatus.duration * 1000 || recorderState.durationMillis)}</Text>
              <Pressable
                style={s.secondary}
                onPress={() => (playerStatus.playing ? player.pause() : player.play())}
              >
                <Text style={s.secondaryText}>{playerStatus.playing ? 'Pause' : 'Play'}</Text>
              </Pressable>
              {!!uploadError && <Text style={s.error}>{uploadError}</Text>}
              <View style={s.actions}>
                <Pressable style={s.outline} onPress={reRecord} disabled={uploading}>
                  <Text style={s.outlineText}>Re-record</Text>
                </Pressable>
                <Pressable style={s.primary} onPress={upload} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Upload</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center' },
  safe: { flex: 1, backgroundColor: '#F7F3EC', padding: 22, gap: 14 },
  back: { fontSize: 17, fontWeight: '700', color: '#6B5545' },
  title: { fontSize: 28, fontWeight: '800', color: '#211B17' },
  sub: { fontSize: 16, color: '#74675E', textAlign: 'center' },
  error: { color: '#B42318' },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 24, alignItems: 'center', gap: 16, marginTop: 10 },
  doneTitle: { fontSize: 20, fontWeight: '800', color: '#211B17' },
  duration: { fontSize: 44, fontWeight: '800', color: '#211B17', fontVariant: ['tabular-nums'] },
  recordButton: { backgroundColor: '#B42318', width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  recordButtonActive: { backgroundColor: '#6B5545' },
  recordButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: '#DED6CF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  secondaryText: { color: '#443A34', fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  outline: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: '#D8B4AE', alignItems: 'center' },
  outlineText: { color: '#B42318', fontWeight: '800' },
  primary: { flex: 1, backgroundColor: '#6B5545', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
});
