import { Image } from 'expo-image';
import { View, type ImageStyle, type ViewStyle } from 'react-native';

import { foodIcon } from '@/components/brand-icons';
import { Icon } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/** Foto del producto, o un ícono de comida si todavía no tiene foto. */
export function ProductImage({
  uri,
  name,
  size,
  radius = 16,
  style,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const box: ViewStyle = size ? { width: size, height: size } : { width: '100%', aspectRatio: 1.25 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[box as ImageStyle, { borderRadius: radius }, style as ImageStyle]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name}
      />
    );
  }
  const iconSize = size ? size * 0.5 : 54;
  return (
    <View style={[box, { borderRadius: radius, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name={foodIcon(name)} size={iconSize} color={t.primary} />
    </View>
  );
}
