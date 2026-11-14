import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';

/** Logotipo de texto "YOLI SOFT" (blanco sobre mamey o mamey sobre blanco). */
export function Logo({ size = 28, color = '#FFFFFF' }: { size?: number; color?: string }) {
  const soft = Math.round(size * 0.42);
  return (
    <View style={{ alignItems: 'stretch', alignSelf: 'center' }} accessibilityRole="header" accessibilityLabel="YOLI SOFT">
      <View style={styles.row}>
        <Text style={[styles.word, { fontSize: size, lineHeight: size * 1.15, color, paddingRight: size * 0.08 }]}>YOLI</Text>
        <View style={[styles.badge, { borderColor: color, borderWidth: Math.max(1.5, size * 0.05), borderRadius: soft * 0.45, paddingHorizontal: soft * 0.35, marginBottom: size * 0.14 }]}>
          <Text style={[styles.soft, { fontSize: soft, lineHeight: soft * 1.25, letterSpacing: soft * 0.22, color }]}>SOFT</Text>
        </View>
      </View>
      <View style={[styles.swoosh, { height: Math.max(3, size * 0.12), backgroundColor: color, marginTop: -size * 0.06 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  word: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
  badge: { justifyContent: 'center' },
  soft: { fontWeight: '800', marginRight: -2 },
  swoosh: { borderRadius: 99, transform: [{ rotate: '-2deg' }] },
});
