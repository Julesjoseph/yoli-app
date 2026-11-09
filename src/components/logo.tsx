import { StyleSheet, Text, View } from 'react-native';

/** Logotipo de texto de YOLI (blanco sobre mamey o mamey sobre blanco). */
export function Logo({ size = 28, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }} accessibilityRole="header" accessibilityLabel="YOLI">
      <Text style={[styles.word, { fontSize: size, color }]}>Yoli</Text>
      <View style={[styles.swoosh, { width: size * 1.9, height: Math.max(3, size * 0.13), backgroundColor: color, marginTop: -size * 0.12 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  word: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  swoosh: { borderRadius: 99, transform: [{ rotate: '-4deg' }] },
});
