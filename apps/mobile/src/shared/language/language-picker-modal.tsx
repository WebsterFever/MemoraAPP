import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { LANGUAGE_DISPLAY_NAMES, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@memora/shared';

type Props = {
  visible: boolean;
  selectedCode: SupportedLanguage;
  onSelect: (code: SupportedLanguage) => void;
  onClose: () => void;
};

/**
 * Plain React Native `Modal` + `Pressable` list — deliberately not
 * `ActionSheetIOS` or any other single-platform picker, so this renders
 * identically on Android and iOS.
 */
export function LanguagePickerModal({ visible, selectedCode, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close language picker">
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.title}>Conversation language</Text>
          {SUPPORTED_LANGUAGES.map((code) => {
            const selected = code === selectedCode;
            return (
              <Pressable
                key={code}
                style={[s.row, selected && s.rowSelected]}
                onPress={() => {
                  onSelect(code);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={s.rowText}>{LANGUAGE_DISPLAY_NAMES[code]}</Text>
                {selected && <Text style={s.check}>✓</Text>}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '82%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 16, padding: 8, paddingTop: 14 },
  title: { fontSize: 15, fontWeight: '800', color: '#5D493B', paddingHorizontal: 14, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  rowSelected: { backgroundColor: '#F4EEE8' },
  rowText: { fontSize: 16, color: '#29231F' },
  check: { fontSize: 16, color: '#5D493B', fontWeight: '900' },
});
