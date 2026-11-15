/** Unidades de medida de los insumos, con nombres fáciles de entender. */
export const UNITS: { value: string; one: string; many: string }[] = [
  { value: 'pieza', one: 'pieza', many: 'piezas' },
  { value: 'unidad', one: 'unidad', many: 'unidades' },
  { value: 'porcion', one: 'porción', many: 'porciones' },
  { value: 'lb', one: 'libra', many: 'libras' },
  { value: 'onza', one: 'onza', many: 'onzas' },
  { value: 'kg', one: 'kilo', many: 'kilos' },
  { value: 'g', one: 'gramo', many: 'gramos' },
  { value: 'litro', one: 'litro', many: 'litros' },
  { value: 'ml', one: 'mililitro', many: 'mililitros' },
  { value: 'galon', one: 'galón', many: 'galones' },
  { value: 'lonja', one: 'lonja', many: 'lonjas' },
  { value: 'paquete', one: 'paquete', many: 'paquetes' },
];

/** "3 piezas", "1 libra"… Si la unidad no está en la lista se muestra tal cual. */
export function unitName(unit: string, qty = 2) {
  const u = UNITS.find((x) => x.value === unit);
  if (!u) return unit;
  return Math.abs(qty) === 1 ? u.one : u.many;
}
