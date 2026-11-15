/**
 * Lee el menú de una tienda de PedidosYa desde la página guardada en la PC
 * (Ctrl + S › "Página web completa"). La página trae el menú en datos
 * estructurados (schema.org "Menu"): secciones, productos, precio y foto.
 * Sin dependencias: se prueba en Node.
 */

export interface MenuItem {
  section: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Nombre limpio: sin espacios dobles ni comas o puntos sueltos al final. */
export const cleanMenuName = (s: string) => s.replace(/\s+/g, ' ').replace(/[\s,.;]+$/, '').trim();

/** Foto en buena calidad y tamaño moderado (las de PedidosYa aceptan ?width=). */
export function menuImageUrl(url: string, width = 600) {
  const base = url.split('?')[0];
  return /dhmedia\.io/.test(base) ? `${base}?quality=85&width=${width}` : url;
}

export function parsePedidosYaMenu(text: string): { items: MenuItem[]; error?: string } {
  const items: MenuItem[] = [];
  const blocks: string[] = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) blocks.push(m[1]);
  if (!blocks.length && /^\s*[[{]/.test(text)) blocks.push(text);

  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (o['@type'] === 'Menu' && Array.isArray(o.hasMenuSection)) {
      for (const s of o.hasMenuSection as Record<string, unknown>[]) {
        const section = cleanMenuName(decode(String(s.name ?? 'Menú')));
        for (const it of (Array.isArray(s.hasMenuItem) ? s.hasMenuItem : []) as Record<string, unknown>[]) {
          const name = cleanMenuName(decode(String(it.name ?? '')));
          if (!name) continue;
          const offers = (Array.isArray(it.offers) ? it.offers[0] : it.offers) as Record<string, unknown> | undefined;
          const img = Array.isArray(it.image) ? it.image[0] : it.image;
          items.push({
            section,
            name,
            description: decode(String(it.description ?? '')).trim(),
            price: Number(offers?.price ?? 0) || 0,
            image: typeof img === 'string' && /^https?:\/\//.test(img) ? img : null,
          });
        }
      }
      return;
    }
    Object.values(o).forEach(walk);
  };
  for (const b of blocks) {
    try {
      walk(JSON.parse(decode(b.trim())));
    } catch {
      try {
        walk(JSON.parse(b.trim()));
      } catch {
        /* bloque que no es JSON */
      }
    }
  }
  if (!items.length) {
    return {
      items,
      error:
        'No encontré el menú en este archivo. Abre tu tienda en Chrome, espera a que se vean los productos y guárdala con Ctrl + S como "Página web completa".',
    };
  }
  // Un mismo nombre puede salir en dos secciones: se queda el primero.
  const seen = new Set<string>();
  return {
    items: items.filter((i) => {
      const k = i.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  };
}
