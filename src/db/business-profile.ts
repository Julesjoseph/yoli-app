import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSettings } from '@/db/database';
import type { Context } from '@/db/repo';
import { supabase } from '@/sync/supabase';

/** Datos del negocio que cada cliente personaliza (todo opcional menos el nombre comercial). */
export interface BusinessProfile {
  name: string; // nombre comercial
  legalName: string; // razón social
  rnc: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string;
}

// Se guarda también en el equipo para usarlo sin internet (ticket, menú lateral).
const KEYS: Record<keyof BusinessProfile, string> = {
  name: 'business_name',
  legalName: 'biz_legal_name',
  rnc: 'biz_rnc',
  phone: 'biz_phone',
  email: 'biz_email',
  address: 'biz_address',
  logoUrl: 'business_logo',
};

const COLUMNS: Record<keyof BusinessProfile, string> = {
  name: 'name',
  legalName: 'legal_name',
  rnc: 'rnc',
  phone: 'phone',
  email: 'email',
  address: 'address',
  logoUrl: 'logo_url',
};

const FIELDS = Object.keys(KEYS) as (keyof BusinessProfile)[];

export async function getLocalProfile(db: SQLiteDatabase): Promise<BusinessProfile> {
  const values = await Promise.all(FIELDS.map((f) => getSetting(db, KEYS[f])));
  return Object.fromEntries(FIELDS.map((f, i) => [f, values[i] ?? ''])) as unknown as BusinessProfile;
}

async function saveLocal(db: SQLiteDatabase, p: BusinessProfile) {
  await setSettings(db, Object.fromEntries(FIELDS.map((f) => [KEYS[f], p[f].trim() || null])));
}

/** Baja el perfil de la nube y lo guarda en el equipo. Sin la migración 0009 trae lo que haya. */
export async function pullProfile(db: SQLiteDatabase, businessId: string) {
  if (!supabase) return;
  let { data, error } = await supabase.from('businesses').select('name, legal_name, rnc, phone, email, address, logo_url').eq('id', businessId).maybeSingle();
  if (error) ({ data, error } = await supabase.from('businesses').select('name, rnc').eq('id', businessId).maybeSingle());
  if (error || !data) return;
  const row = data as Record<string, string | null>;
  await saveLocal(db, Object.fromEntries(FIELDS.map((f) => [f, row[COLUMNS[f]] ?? ''])) as unknown as BusinessProfile);
}

export async function saveProfile(db: SQLiteDatabase, ctx: Context, p: BusinessProfile): Promise<string | null> {
  if (!p.name.trim()) return 'Escribe el nombre comercial.';
  if (p.email.trim() && !/^\S+@\S+\.\S+$/.test(p.email.trim())) return 'El correo no se ve bien. Revísalo.';
  if (!ctx.demo && supabase) {
    const row = Object.fromEntries(FIELDS.map((f) => [COLUMNS[f], f === 'name' ? p.name.trim() : p[f].trim() || null]));
    const { error } = await supabase.from('businesses').update(row).eq('id', ctx.businessId);
    if (error) {
      if (/column|schema cache/i.test(error.message)) return 'Falta un paso en Supabase: corre el archivo 0009_perfil_negocio.sql.';
      if (/fetch|network/i.test(error.message)) return 'Sin internet. Conéctate para guardar el perfil.';
      return error.message;
    }
  }
  await saveLocal(db, p);
  return null;
}
