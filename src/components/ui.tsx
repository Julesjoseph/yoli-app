import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { BrandGradient } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? t.text} />;
}

/** Sombra suave para tarjetas (iOS y Android). */
export function useElevation(level: 1 | 2 = 1): ViewStyle {
  const t = useTheme();
  return Platform.select<ViewStyle>({
    android: { elevation: level === 1 ? 2 : 6 },
    default: {
      shadowColor: t.shadow,
      shadowOpacity: level === 1 ? 0.06 : 0.14,
      shadowRadius: level === 1 ? 10 : 18,
      shadowOffset: { width: 0, height: level === 1 ? 3 : 8 },
    },
  })!;
}

export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
  right,
  footer,
  back,
  brand,
}: {
  /** Encabezado de marca: logo centrado con botones a los lados. */
  brand?: { left?: ReactNode; right?: ReactNode };
  /** Muestra una flecha para volver (pantallas que no son pestañas). */
  back?: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  right?: ReactNode;
  /** Barra fija abajo (por ejemplo, el total de la orden). */
  footer?: ReactNode;
}) {
  const t = useTheme();
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.background }}>
      {brand ? (
        <View style={styles.brandHeader}>
          <View style={styles.brandSide}>{brand.left}</View>
          <Logo size={30} color={t.primary} />
          <View style={[styles.brandSide, { alignItems: 'flex-end' }]}>{brand.right}</View>
        </View>
      ) : null}
      <View style={[styles.header, brand && !title && { display: 'none' }]}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={8}
            style={[styles.back, { backgroundColor: t.backgroundElement, borderColor: t.border }]}>
            <Icon name="arrow-left" size={22} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          {subtitle ? (
            <View style={styles.subtitleRow}>
              <Icon name="map-marker-outline" size={15} color={t.primary} />
              <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>{subtitle}</Text>
            </View>
          ) : null}
        </View>
        {right}
      </View>
      {body}
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const t = useTheme();
  const elevation = useElevation(1);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.backgroundElement, borderColor: t.border },
        elevation,
        !padded && { padding: 0 },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Tarjeta con degradado de marca (resúmenes destacados). */
export function HeroCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const elevation = useElevation(2);
  return (
    <LinearGradient
      colors={BrandGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, elevation, style]}>
      {children}
    </LinearGradient>
  );
}

export function Label({
  children,
  muted,
  bold,
  size = 16,
  color,
  numberOfLines,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  bold?: boolean;
  size?: number;
  color?: string;
  numberOfLines?: number;
  style?: object;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: color ?? (muted ? t.textSecondary : t.text), fontSize: size, fontWeight: bold ? '700' : '500' },
        style,
      ]}>
      {children}
    </Text>
  );
}

/** Botón redondo con ícono (encabezados). Con `badge` muestra un contador. */
export function IconButton({ icon, onPress, label, badge }: { icon: IconName; onPress: () => void; label: string; badge?: number }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: t.backgroundElement, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={22} />
      {badge ? (
        <View style={[styles.iconBadge, { backgroundColor: t.primary }]}>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900' }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SectionTitle({ children, icon, right }: { children: ReactNode; icon?: IconName; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { marginTop: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Icon name={icon} size={20} color={t.primary} /> : null}
        <Text style={{ color: t.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>{children}</Text>
      </View>
      {right}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
  icon,
  size = 'md',
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTheme();
  const pad = size === 'sm' ? 8 : size === 'lg' ? 17 : 13;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  const fg =
    variant === 'primary' ? t.onPrimary : variant === 'danger' ? t.danger : variant === 'ghost' ? t.primary : t.text;
  const content = (
    <View style={[styles.buttonInner, { paddingVertical: pad }]}>
      {icon ? <Icon name={icon} size={fontSize + 3} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize }}>{title}</Text>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && { backgroundColor: t.backgroundSelected },
        variant === 'danger' && { backgroundColor: t.dangerSoft },
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { value: T; label: string; icon?: IconName; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  scroll?: boolean;
}) {
  const t = useTheme();
  const chips = options.map((o) => {
    const selected = o.value === value;
    const accent = o.color ?? t.primary;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(o.value)}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? accent : t.backgroundSelected,
            borderColor: selected ? accent : t.border,
          },
        ]}>
        {o.icon ? <Icon name={o.icon} size={16} color={selected ? '#FFFFFF' : t.textSecondary} /> : null}
        <Text style={{ color: selected ? '#FFFFFF' : t.text, fontWeight: '700', fontSize: 14 }}>{o.label}</Text>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={styles.chips}>{chips}</View>;
}

export function Field(props: TextInputProps & { label: string; icon?: IconName }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const { label, style, icon, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
      <View
        style={[
          styles.inputWrap,
          { borderColor: focused ? t.primary : t.border, backgroundColor: t.background },
        ]}>
        {icon ? <Icon name={icon} size={20} color={focused ? t.primary : t.textSecondary} /> : null}
        <TextInput
          placeholderTextColor={t.textSecondary}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, { color: t.text }, style]}
          {...rest}
        />
      </View>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 2 }} />;
}

/** Ícono dentro de un círculo de color suave. */
export function IconBadge({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={name} size={size * 0.55} color={color} />
    </View>
  );
}

/** Indicador (KPI): ícono, etiqueta y valor. */
export function Stat({
  icon,
  label,
  value,
  color,
  style,
}: {
  icon: IconName;
  label: string;
  value: string;
  color: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 150, gap: 10, ...style }}>
      <IconBadge name={icon} color={color} size={36} />
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: t.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </Card>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.backgroundSelected, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + '22', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon, text }: { icon: IconName; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
      <IconBadge name={icon} color={t.textSecondary} size={52} />
      <Text style={{ color: t.textSecondary, textAlign: 'center', fontSize: 15 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 12,
  },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  iconBadge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  content: { padding: 16, gap: 14, paddingBottom: 130 },
  brandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6 },
  brandSide: { width: 96 },
  card: { borderRadius: 20, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  hero: { borderRadius: 24, padding: 20, gap: 8 },
  button: { borderRadius: 14, overflow: 'hidden' },
  buttonGradient: { borderRadius: 14 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
