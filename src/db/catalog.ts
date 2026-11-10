import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { supabase } from '@/sync/supabase';

import { addStock, type Context } from './repo';

/**
 * Catálogo: categorías, productos, insumos y recetas.
 * La nube es la fuente oficial: con sesión iniciada, cada cambio se guarda
 * primero en Supabase (necesita internet) y luego en el equipo.
 * En modo demo se guarda solo en el equipo.
 */

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  itbis_rate: number;
  active: number;
  image_url: string | null;
  price_pedidosya: number | null;
  price_ubereats: number | null;
}
export interface CatalogCategory {
  id: string;
  name: string;
  sort_order: number;
}
export interface CatalogIngredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  min_stock: number;
}
/** Parte de un combo: incluida siempre (group = '') o una opción para elegir dentro de un grupo. */
export interface ComboLine {
  item_product_id: string;
  group_name: string;
  extra_price: number;
}
export interface RecipeLine {
  ingredient_id: string;
  quantity: number;
}

export const listCatalogProducts = (db: SQLiteDatabase) =>
  db.getAllAsync<CatalogProduct>(
    'SELECT id, name, price, category_id, itbis_rate, active, image_url, price_pedidosya, price_ubereats FROM products ORDER BY active DESC, name',
  );
export const listCatalogCategories = (db: SQLiteDatabase) =>
  db.getAllAsync<CatalogCategory>('SELECT id, name, sort_order FROM categories ORDER BY sort_order, name');
export const listCatalogIngredients = (db: SQLiteDatabase) =>
  db.getAllAsync<CatalogIngredient>('SELECT id, name, unit, cost_per_unit, min_stock FROM ingredients ORDER BY name');
export const getRecipe = (db: SQLiteDatabase, productId: string) =>
  db.getAllAsync<RecipeLine>('SELECT ingredient_id, quantity FROM recipe_items WHERE product_id = ?', [productId]);

export const getComboLines = (db: SQLiteDatabase, productId: string) =>
  db.getAllAsync<ComboLine>(
    'SELECT item_product_id, group_name, extra_price FROM combo_items WHERE product_id = ? ORDER BY sort_order',
    [productId],
  );

export async function getProduct(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<CatalogProduct>(
    'SELECT id, name, price, category_id, itbis_rate, active, image_url, price_pedidosya, price_ubereats FROM products WHERE id = ?',
    [id],
  );
}

/** Costo de los ingredientes de un producto según su receta. */
export function recipeCost(recipe: RecipeLine[], ingredients: CatalogIngredient[]) {
  return recipe.reduce((sum, r) => {
    const i = ingredients.find((x) => x.id === r.ingredient_id);
    return sum + (i ? i.cost_per_unit * r.quantity : 0);
  }, 0);
}

function friendly(message: string) {
  if (/network|fetch|failed to fetch|timeout/i.test(message)) {
    return 'Necesitas internet para cambiar el catálogo.';
  }
  if (/price_pedidosya|price_ubereats/i.test(message)) {
    return 'Falta actualizar la nube: ejecuta el archivo 0004_precios_delivery_descuentos.sql en Supabase.';
  }
  if (/row-level security|permission/i.test(message)) {
    return 'Solo el dueño o un gerente puede cambiar el catálogo.';
  }
  return message;
}

async function cloud(ctx: Context, run: () => PromiseLike<{ error: { message: string } | null }>) {
  if (ctx.demo || !supabase) return;
  let result: { error: { message: string } | null };
  try {
    result = await run();
  } catch (e) {
    throw new Error(friendly(String(e)));
  }
  if (result.error) throw new Error(friendly(result.error.message));
}

export async function saveCategory(db: SQLiteDatabase, ctx: Context, input: { id?: string; name: string; sort_order?: number }) {
  const row = {
    id: input.id ?? randomUUID(),
    business_id: ctx.businessId,
    name: input.name.trim(),
    sort_order: input.sort_order ?? 0,
  };
  if (!row.name) throw new Error('Escribe el nombre de la categoría.');
  await cloud(ctx, () => supabase!.from('categories').upsert(row));
  await db.runAsync('INSERT OR REPLACE INTO categories (id, business_id, name, sort_order) VALUES (?, ?, ?, ?)', [
    row.id, row.business_id, row.name, row.sort_order,
  ]);
  return row.id;
}

export async function saveIngredient(
  db: SQLiteDatabase,
  ctx: Context,
  input: { id?: string; name: string; unit: string; cost_per_unit: number; min_stock: number },
) {
  const row = {
    id: input.id ?? randomUUID(),
    business_id: ctx.businessId,
    name: input.name.trim(),
    unit: input.unit.trim() || 'unidad',
    cost_per_unit: input.cost_per_unit,
    min_stock: input.min_stock,
  };
  if (!row.name) throw new Error('Escribe el nombre del insumo.');
  if (![row.cost_per_unit, row.min_stock].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error('Revisa el costo y el mínimo: deben ser números positivos.');
  }
  await cloud(ctx, () => supabase!.from('ingredients').upsert(row));
  await db.runAsync(
    'INSERT OR REPLACE INTO ingredients (id, business_id, name, unit, cost_per_unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)',
    [row.id, row.business_id, row.name, row.unit, row.cost_per_unit, row.min_stock],
  );
  return row.id;
}

export async function saveProduct(
  db: SQLiteDatabase,
  ctx: Context,
  input: {
    id?: string;
    name: string;
    price: number;
    category_id: string | null;
    itbis_rate: number;
    active: boolean;
    image_url?: string | null;
    /** Precio en PedidosYa / Uber Eats (vacío = igual que en el local). */
    price_pedidosya?: number | null;
    price_ubereats?: number | null;
  },
  recipe: RecipeLine[],
  /** undefined = no tocar el combo (así funciona aunque la nube no tenga la tabla). */
  combo?: ComboLine[],
) {
  const before = input.id
    ? await db.getFirstAsync<{ price_pedidosya: number | null; price_ubereats: number | null }>(
        'SELECT price_pedidosya, price_ubereats FROM products WHERE id = ?',
        [input.id],
      )
    : null;
  const pedidosya = input.price_pedidosya ?? null;
  const ubereats = input.price_ubereats ?? null;
  // Los precios de delivery solo se envían si se usan, así funciona aunque la nube aún no tenga esas columnas.
  const deliveryPrices =
    pedidosya !== null || ubereats !== null || before?.price_pedidosya != null || before?.price_ubereats != null
      ? { price_pedidosya: pedidosya, price_ubereats: ubereats }
      : {};
  const row = {
    id: input.id ?? randomUUID(),
    business_id: ctx.businessId,
    category_id: input.category_id,
    name: input.name.trim(),
    price: input.price,
    itbis_rate: input.itbis_rate,
    active: input.active,
    // Solo se envía si se cambió, así funciona aunque la nube aún no tenga la columna de fotos.
    ...(input.image_url !== undefined ? { image_url: input.image_url } : {}),
    ...deliveryPrices,
  };
  if (!row.name) throw new Error('Escribe el nombre del producto.');
  if (!Number.isFinite(row.price) || row.price <= 0) throw new Error('Escribe un precio válido.');
  if ([pedidosya, ubereats].some((n) => n !== null && (!Number.isFinite(n) || n <= 0))) {
    throw new Error('Revisa los precios de PedidosYa y Uber Eats (o déjalos vacíos).');
  }
  const lines = recipe.filter((r) => Number.isFinite(r.quantity) && r.quantity > 0);

  await cloud(ctx, () => supabase!.from('products').upsert({ ...row, updated_at: new Date().toISOString() }));
  await cloud(ctx, () => supabase!.from('recipe_items').delete().eq('product_id', row.id));
  if (lines.length) {
    await cloud(ctx, () =>
      supabase!.from('recipe_items').insert(lines.map((l) => ({ product_id: row.id, ingredient_id: l.ingredient_id, quantity: l.quantity }))),
    );
  }

  const comboRows = (combo ?? [])
    .filter((c) => c.item_product_id && c.item_product_id !== row.id)
    .map((c, i) => ({
      id: randomUUID(),
      business_id: ctx.businessId,
      product_id: row.id,
      item_product_id: c.item_product_id,
      group_name: c.group_name.trim(),
      extra_price: Number.isFinite(c.extra_price) && c.extra_price > 0 ? c.extra_price : 0,
      sort_order: i,
    }));
  let comboError: Error | null = null;
  if (combo !== undefined) {
    const hadCombo = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM combo_items WHERE product_id = ?', [row.id]);
    if (comboRows.length || hadCombo?.n) {
      try {
        await cloud(ctx, () => supabase!.from('combo_items').delete().eq('product_id', row.id));
        if (comboRows.length) await cloud(ctx, () => supabase!.from('combo_items').insert(comboRows));
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        comboError = /combo_items|schema cache|does not exist/i.test(m)
          ? new Error('El producto se guardó, pero para los combos falta un paso en Supabase: corre el archivo 0010_combos.sql.')
          : new Error(`El producto se guardó, pero el combo no: ${m}`);
      }
    }
  }

  await db.withTransactionAsync(async () => {
    if (combo !== undefined && !comboError) {
      await db.runAsync('DELETE FROM combo_items WHERE product_id = ?', [row.id]);
      for (const c of comboRows) {
        await db.runAsync(
          'INSERT INTO combo_items (id, business_id, product_id, item_product_id, group_name, extra_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [c.id, c.business_id, c.product_id, c.item_product_id, c.group_name, c.extra_price, c.sort_order],
        );
      }
    }
    const previous = await db.getFirstAsync<{ image_url: string | null }>('SELECT image_url FROM products WHERE id = ?', [row.id]);
    const image = input.image_url !== undefined ? input.image_url : (previous?.image_url ?? null);
    await db.runAsync(
      `INSERT OR REPLACE INTO products (id, business_id, category_id, name, price, itbis_rate, active, image_url, price_pedidosya, price_ubereats)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.business_id, row.category_id, row.name, row.price, row.itbis_rate, row.active ? 1 : 0, image, pedidosya, ubereats],
    );
    await db.runAsync('DELETE FROM recipe_items WHERE product_id = ?', [row.id]);
    for (const l of lines) {
      await db.runAsync('INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [
        row.id, l.ingredient_id, l.quantity,
      ]);
    }
  });
  if (comboError) throw comboError;
  return row.id;
}

/**
 * Sube la foto de un producto y devuelve su dirección pública.
 * En modo demo se usa la foto guardada en el teléfono.
 */
export async function uploadProductImage(ctx: Context, image: { uri: string; base64?: string | null }) {
  if (ctx.demo || !supabase) return image.uri;
  if (!image.base64) throw new Error('No se pudo leer la foto.');
  const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
  const path = `${ctx.businessId}/${randomUUID()}.jpg`;
  let error: { message: string } | null = null;
  try {
    ({ error } = await supabase.storage.from('productos').upload(path, bytes, { contentType: 'image/jpeg' }));
  } catch (e) {
    throw new Error(friendly(String(e)));
  }
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error('Falta activar las fotos en Supabase (archivo 0003_fotos_productos.sql).');
    }
    throw new Error(friendly(error.message));
  }
  return supabase.storage.from('productos').getPublicUrl(path).data.publicUrl;
}

/** Menú típico dominicano de ejemplo para arrancar rápido. */
export const SAMPLE_CATALOG = {
  categories: ['Comida rápida', 'Comedor', 'Cafetería', 'Bebidas'],
  ingredients: {
    pan: { name: 'Pan de hamburguesa', unit: 'unidad', cost: 15, min: 20, initial: 60 },
    carne: { name: 'Carne molida', unit: 'g', cost: 0.45, min: 2000, initial: 6000 },
    queso: { name: 'Queso', unit: 'lonja', cost: 8, min: 30, initial: 80 },
    papas: { name: 'Papas', unit: 'g', cost: 0.08, min: 3000, initial: 10000 },
    arroz: { name: 'Arroz', unit: 'g', cost: 0.06, min: 5000, initial: 15000 },
    pollo: { name: 'Pollo', unit: 'g', cost: 0.25, min: 3000, initial: 8000 },
    habichuelas: { name: 'Habichuelas', unit: 'g', cost: 0.1, min: 2000, initial: 5000 },
    cafe: { name: 'Café molido', unit: 'g', cost: 1.2, min: 500, initial: 1500 },
    leche: { name: 'Leche', unit: 'ml', cost: 0.07, min: 2000, initial: 6000 },
    refresco: { name: 'Refresco lata', unit: 'unidad', cost: 35, min: 24, initial: 48 },
    piezas: { name: 'Pollo frito (piezas)', unit: 'pieza', cost: 38, min: 16, initial: 48 },
    platano: { name: 'Plátano verde', unit: 'unidad', cost: 15, min: 10, initial: 30 },
  },
  products: [
    { name: 'Hamburguesa clásica', price: 295, cat: 0, recipe: [['pan', 1], ['carne', 150], ['queso', 1]] },
    { name: 'Papas fritas', price: 150, cat: 0, recipe: [['papas', 250]] },
    { name: 'Combo hamburguesa', price: 425, cat: 0, recipe: [['pan', 1], ['carne', 150], ['queso', 1], ['papas', 200], ['refresco', 1]] },
    { name: 'La bandera (arroz, habichuelas y pollo)', price: 275, cat: 1, recipe: [['arroz', 200], ['habichuelas', 150], ['pollo', 180]] },
    { name: 'Pollo guisado con arroz', price: 250, cat: 1, recipe: [['arroz', 200], ['pollo', 200]] },
    { name: 'Café', price: 75, cat: 2, recipe: [['cafe', 12]] },
    { name: 'Café con leche', price: 110, cat: 2, recipe: [['cafe', 12], ['leche', 150]] },
    { name: 'Refresco', price: 80, cat: 3, recipe: [['refresco', 1]] },
    { name: 'Tostones', price: 125, cat: 0, recipe: [['platano', 1]] },
    { name: 'Pica pollo (2 piezas)', price: 225, cat: 0, recipe: [['piezas', 2]] },
    {
      name: 'Combo pica pollo',
      price: 375,
      cat: 0,
      recipe: [['piezas', 2]],
      groups: [
        { name: 'Acompañante', options: [['Papas fritas', 0], ['Tostones', 0]] },
        { name: 'Bebida', options: [['Refresco', 0], ['Café', 0]] },
      ],
    },
  ] as {
    name: string;
    price: number;
    cat: number;
    recipe: [string, number][];
    groups?: { name: string; options: [string, number][] }[];
  }[],
};

/** Carga el menú de ejemplo (y un inventario inicial en el local actual). */
export async function loadSampleCatalog(db: SQLiteDatabase, ctx: Context) {
  const catIds: string[] = [];
  for (const [i, name] of SAMPLE_CATALOG.categories.entries()) {
    catIds.push(await saveCategory(db, ctx, { name, sort_order: i + 1 }));
  }
  const ingIds: Record<string, string> = {};
  for (const [key, i] of Object.entries(SAMPLE_CATALOG.ingredients)) {
    ingIds[key] = await saveIngredient(db, ctx, { name: i.name, unit: i.unit, cost_per_unit: i.cost, min_stock: i.min });
    await addStock(db, ctx, ingIds[key], i.initial, 'ajuste');
  }
  const prodIds: Record<string, string> = {};
  for (const p of SAMPLE_CATALOG.products) {
    prodIds[p.name] = await saveProduct(
      db,
      ctx,
      { name: p.name, price: p.price, category_id: catIds[p.cat], itbis_rate: 0.18, active: true },
      p.recipe.map(([key, quantity]) => ({ ingredient_id: ingIds[key], quantity })),
      p.groups?.flatMap((g) => g.options.map(([name, extra]) => ({ item_product_id: prodIds[name]!, group_name: g.name, extra_price: extra }))),
    );
  }
}
