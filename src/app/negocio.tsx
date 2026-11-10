import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth';
import { Text } from '@/components/text';
import { Button, Card, Field, Icon, Label, Screen, SectionTitle } from '@/components/ui';
import { getLocalProfile, saveProfile, type BusinessProfile } from '@/db/business-profile';
import { uploadProductImage } from '@/db/catalog';
import { canManage, useBusiness, useBusinessState } from '@/hooks/use-business';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/sync/supabase';

const EMPTY: BusinessProfile = { name: '', legalName: '', rnc: '', phone: '', email: '', address: '', logoUrl: '' };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'Y';
}

/** Perfil del negocio: logo, nombre comercial, razón social, RNC y contacto. También "Tu nombre". */
export default function BusinessProfileScreen() {
  const db = useSQLiteContext();
  const ctx = useBusiness();
  const auth = useAuth();
  const { refreshContext } = useBusinessState();
  const t = useTheme();
  const manager = canManage(ctx);
  const [p, setP] = useState<BusinessProfile | null>(null);
  const [myName, setMyName] = useState((auth.session?.user.user_metadata?.name as string | undefined) ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  useEffect(() => {
    getLocalProfile(db).then((x) => setP({ ...EMPTY, ...x }));
  }, [db]);

  if (!p) return <Screen back title="Perfil del negocio">{null}</Screen>;
  const set = (k: keyof BusinessProfile) => (v: string) => setP({ ...p, [k]: v });

  async function pickLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', 'Permite el acceso a tus fotos para elegir el logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    setMsg(null);
    try {
      const url = await uploadProductImage(ctx, result.assets[0]);
      setP((cur) => (cur ? { ...cur, logoUrl: url } : cur));
      setMsg({ text: 'Logo listo. Toca “Guardar” para que quede en el perfil.', ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!p) return;
    setSaving(true);
    setMsg(null);
    let error = manager ? await saveProfile(db, ctx, p) : null;
    // Tu nombre (de la persona que usa la cuenta, no del negocio).
    const oldName = (auth.session?.user.user_metadata?.name as string | undefined) ?? '';
    if (!error && !ctx.demo && supabase && myName.trim() && myName.trim() !== oldName) {
      const { error: e } = await supabase.auth.updateUser({ data: { name: myName.trim() } });
      if (e) error = e.message;
      else await supabase.from('members').update({ display_name: myName.trim() }).eq('user_id', ctx.userId).eq('business_id', ctx.businessId);
    }
    setSaving(false);
    if (error) return setMsg({ text: error });
    await refreshContext();
    setMsg({ text: 'Perfil guardado.', ok: true });
  }

  return (
    <Screen back title="Perfil del negocio" subtitle={manager ? 'Así aparece tu negocio en la app y en el ticket' : 'Solo el dueño o el gerente pueden cambiarlo'}>
      <Card style={{ alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar logo" onPress={pickLogo} disabled={!manager || uploading}>
          {p.logoUrl ? (
            <Image source={{ uri: p.logoUrl }} style={[styles.logo, { borderColor: t.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.logo, { backgroundColor: t.brand, borderColor: t.brand }]}>
              <Text style={styles.logoText}>{initials(p.name)}</Text>
            </View>
          )}
          {manager ? (
            <View style={[styles.camera, { backgroundColor: t.primary, borderColor: t.backgroundElement }]}>
              <Icon name="camera" size={16} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
        <Label bold size={18}>{p.name || 'Tu negocio'}</Label>
        {manager ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" variant="secondary" icon="image-outline" title={uploading ? 'Subiendo…' : p.logoUrl ? 'Cambiar logo' : 'Subir logo'} onPress={pickLogo} disabled={uploading} />
            {p.logoUrl ? <Button size="sm" variant="ghost" icon="close" title="Quitar" onPress={() => setP({ ...p, logoUrl: '' })} /> : null}
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: 14 }}>
        <SectionTitle icon="storefront-outline">Datos del negocio</SectionTitle>
        <Field label="Nombre comercial" icon="storefront-outline" value={p.name} onChangeText={set('name')} editable={manager} placeholder="Ej. Antojitos Yolanda" />
        <Field label="Razón social (opcional)" icon="domain" value={p.legalName} onChangeText={set('legalName')} editable={manager} placeholder="Ej. Antojitos Yolanda SRL" />
        <Field label="RNC (opcional)" icon="card-account-details-outline" value={p.rnc} onChangeText={set('rnc')} editable={manager} keyboardType="number-pad" placeholder="Ej. 131234567" />
        <Field label="Teléfono (opcional)" icon="phone-outline" value={p.phone} onChangeText={set('phone')} editable={manager} keyboardType="phone-pad" placeholder="Ej. 809-555-1234" />
        <Field
          label="Correo (opcional)"
          icon="email-outline"
          value={p.email}
          onChangeText={set('email')}
          editable={manager}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="negocio@ejemplo.com"
        />
        <Field
          label="Dirección (opcional)"
          icon="map-marker-outline"
          value={p.address}
          onChangeText={set('address')}
          editable={manager}
          multiline
          placeholder="Calle, número, sector, ciudad"
        />
      </Card>

      {!ctx.demo ? (
        <Card style={{ gap: 14 }}>
          <SectionTitle icon="account-circle-outline">Tus datos</SectionTitle>
          <Field label="Tu nombre" icon="account-outline" value={myName} onChangeText={setMyName} autoComplete="name" placeholder="Ej. Juana Pérez" />
          <Label muted size={13}>Correo de tu cuenta: {auth.session?.user.email ?? '—'}</Label>
        </Card>
      ) : null}

      {msg ? (
        <View style={[styles.msg, { backgroundColor: msg.ok ? t.successSoft : t.dangerSoft }]}>
          <Icon name={msg.ok ? 'check-circle' : 'alert-circle'} size={18} color={msg.ok ? t.success : t.danger} />
          <Label size={14} color={msg.ok ? t.success : t.danger} style={{ flex: 1 }}>{msg.text}</Label>
        </View>
      ) : null}
      <Button size="lg" icon="content-save-outline" title={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving || uploading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: 112, height: 112, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoText: { color: '#FFFFFF', fontSize: 38, fontWeight: '900' },
  camera: { position: 'absolute', right: -4, bottom: -4, width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 10 },
});
