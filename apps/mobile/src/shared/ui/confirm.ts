import { Alert, Platform } from 'react-native';

/**
 * React Native's Alert.alert() renders nothing on web (react-native-web has
 * no dialog implementation for it — buttons never appear, so any logic
 * inside an Alert button's onPress is unreachable on web). This falls back
 * to the browser's native confirm() there, and keeps the real native Alert
 * on iOS/Android.
 */
export function confirmDestructive(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window === 'undefined' ? false : window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
