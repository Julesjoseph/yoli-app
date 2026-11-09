# YOLI APP

App móvil (Android, iPhone y tablet) para manejar un negocio de comida rápida, comedor y cafetería en República Dominicana.

## Qué hace esta primera versión

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

## Conectar la nube (Supabase)

1. Crea un proyecto gratis en https://supabase.com
2. En *SQL Editor*, ejecuta `supabase/migrations/0001_esquema_inicial.sql`.
3. Copia `.env.example` como `.env` y pon la URL y la anon key del proyecto.

## Estructura

```
src/app/            Pantallas: index (Caja), inventario, gastos, reportes
src/lib/calc.ts     Cálculos de ITBIS, propina, comisiones, recetas y ganancia (con pruebas)
src/db/             Base de datos local y consultas
src/sync/           Subida de la cola local a Supabase
src/invoicing/      Adaptador para el proveedor de factura electrónica
supabase/           Esquema de la base de datos en la nube
tests/              Pruebas (npm test)
```

## Próximos pasos

- Inicio de sesión y roles (dueño, gerente, cajero, cocina) con Supabase Auth
- Selector de local y descarga del menú/insumos desde la nube
- Editar menú, recetas y precios distintos por plataforma
- Cierre de caja diario
- Importar reportes de PedidosYa y Uber Eats (CSV)
- Conectar el proveedor de e-CF elegido
