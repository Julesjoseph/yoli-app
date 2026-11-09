# YOLI APP

App móvil (Android, iPhone y tablet) para manejar un negocio de comida rápida, comedor y cafetería en República Dominicana.

## Qué hace esta primera versión

- **Inicio:** panel con ventas y ganancia del día, accesos rápidos, alertas de stock y últimas ventas.
- **Catálogo:** crear y editar productos, precios, ITBIS, categorías, insumos y recetas (con costo y margen). Botón para cargar un menú de ejemplo.

- **Caja (POS):** menú por categorías, órdenes de comedor, para llevar, PedidosYa y Uber Eats. Calcula ITBIS 18% (incluido en el precio) y el 10% de ley de propina en comedor. En tablet muestra el menú y la orden lado a lado.
- **PedidosYa y Uber Eats:** cada pedido guarda su número y descuenta la comisión de la plataforma (25% y 30% de ejemplo, configurables) para ver el ingreso real.
- **Inventario:** insumos con stock mínimo y recetas. Cada venta descuenta los ingredientes automáticamente. Entradas por compra, mermas y ajustes.
- **Gastos:** por categoría, con NCF del proveedor (útil para el reporte 606).
- **Reportes:** ventas, comisiones, ITBIS, gastos y ganancia de hoy, la semana o el mes, por canal y los productos más vendidos.
- **Sin internet:** todo se guarda en el dispositivo (SQLite) y queda en una cola para subir a Supabase cuando hay conexión.
- **Factura electrónica (e-CF DGII):** módulo listo en `src/invoicing/provider.ts` para conectar un proveedor certificado. Hoy usa un modo de prueba que no emite comprobantes válidos.

## Tecnología

- Expo SDK 58 + React Native + Expo Router
- SQLite local (`expo-sqlite`) para trabajar sin internet
- Supabase (Postgres + usuarios + seguridad por negocio) para respaldo en la nube y varios locales

## Cómo probarla

```bash
npm install
npx expo start
```

Escanea el código QR con la app **Expo Go** en tu teléfono o tablet. La primera vez se cargan productos e insumos de ejemplo.

La app ya apunta al proyecto de Supabase del negocio (`src/sync/config.ts`). Para probar en **modo demo** (un local con datos de ejemplo, sin inicio de sesión), crea un `.env` con `EXPO_PUBLIC_SUPABASE_URL=` vacío.

## Conectar la nube (Supabase)

1. Crea un proyecto gratis en https://supabase.com
2. En *SQL Editor*, ejecuta en orden los archivos de `supabase/migrations/` (`0001_…` y luego `0002_…`).
3. Pon la URL y la clave *publishable* del proyecto en `src/sync/config.ts` (Project Settings > API Keys). Nunca la clave *secret*.
4. Abre la app, toca **Crear cuenta**, y luego **Crear negocio**. Quedas como dueño.

### Personal y roles

Cada empleado crea su cuenta en la app con su correo. Luego el dueño o un gerente lo agrega en **Ajustes > Personal**, eligiendo su rol y su local (o todos los locales).

| Rol | Puede |
| --- | --- |
| Dueño | Todo, incluido agregar o quitar gerentes y otros dueños |
| Gerente | Todo menos tocar a los dueños: menú, locales, personal, gastos y reportes |
| Cajero | Caja e inventario de su local |
| Cocina | Caja e inventario de su local |

Los permisos se aplican también en el servidor (RLS de Postgres), no solo en la app.

### Cómo funciona sin internet

- Al entrar, la app descarga el menú, insumos, recetas y locales del negocio, más las ventas y gastos del local de los últimos 35 días y su stock actual.
- Cada venta, gasto o movimiento de inventario se guarda primero en el equipo y entra a una cola. La cola se sube sola cada minuto y al volver a abrir la app.
- Si alguien ya entró antes en ese equipo, puede seguir trabajando aunque no haya internet al abrir la app.

## Estructura

```
src/app/(tabs)/     Pestañas: Inicio, Caja, Inventario, Reportes, Ajustes
src/app/catalogo/   Catálogo de productos, insumos y recetas
src/app/gastos.tsx  Gastos
src/lib/calc.ts     Cálculos de ITBIS, propina, comisiones, recetas y ganancia (con pruebas)
src/db/             Base de datos local y consultas
src/sync/           Subida de la cola local a Supabase
src/invoicing/      Adaptador para el proveedor de factura electrónica
supabase/           Esquema de la base de datos en la nube
src/auth/           Inicio de sesión (Supabase Auth)
src/screens/        Pantallas previas: entrar, crear negocio, elegir local
tests/              Pruebas de cálculos (npm test)
supabase/tests/     Pruebas de seguridad del servidor (npm run test:db, requiere Postgres local)
```

## Próximos pasos

- Precios distintos por plataforma de delivery
- Cierre de caja diario
- Importar reportes de PedidosYa y Uber Eats (CSV)
- Conectar el proveedor de e-CF elegido
