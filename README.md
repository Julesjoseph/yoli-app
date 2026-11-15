# YOLI APP

App móvil (Android, iPhone y tablet) para manejar un negocio de comida rápida, comedor y cafetería en República Dominicana.

## Qué hace esta primera versión

- **Panel de administración:** (dueño y gerente) ventas, ticket promedio, gastos, ganancia, ventas por hora o día, por canal y por local, más vendidos, stock bajo y últimas ventas. Con internet muestra todos los locales desde la nube y se actualiza cada minuto.
- **Inicio:** panel con ventas y ganancia del día, accesos rápidos, alertas de stock y últimas ventas.
- **Catálogo:** crear y editar productos con foto (galería o cámara), precios, ITBIS, categorías, insumos y recetas (con costo y margen). Botón para cargar un menú de ejemplo.
- **Caja (POS):** menú con tarjetas de productos con foto, detalle de cada producto con sus ingredientes, y una pantalla de orden tipo carrito. Menú por categorías, órdenes de comedor, para llevar, PedidosYa y Uber Eats. Calcula ITBIS 18% (incluido en el precio) y el 10% de ley de propina en comedor. En tablet muestra el menú y la orden lado a lado.
- **Ticket térmico:** al cobrar, la app ofrece imprimir el ticket (58 u 80 mm) con el servicio de impresión del teléfono. Se configura en **Perfil > Impresora y ticket** (RNC, dirección, teléfono, imprimir al cobrar). Desde Inicio se puede reimprimir una venta. No es comprobante fiscal; la factura e-CF llegará con el proveedor.
- **Descuentos:** en comedor y para llevar se puede aplicar 5–20% o un monto/porcentaje propio al cobrar. El ITBIS y la propina se calculan sobre el precio con descuento, y el ticket lo muestra.
- **Precios de delivery:** cada producto puede tener un precio distinto en PedidosYa y en Uber Eats (vacío = mismo precio del local).
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

## Usarla desde la PC

En la PC, dentro de la carpeta de la app:

```bash
npm run pc
```

Se abre en el navegador (http://localhost:8081) con menú lateral. Entra con el mismo correo: las ventas de los teléfonos y de la PC se juntan en la nube.

Para tener una dirección fija en internet (sin dejar la PC con PowerShell abierto), se puede publicar en Netlify: el archivo `netlify.toml` ya trae la configuración (`npm run build:web` genera la carpeta `dist`).

## Publicar la app

**Android (APK):** con una cuenta gratis de https://expo.dev:

```bash
npm install -g eas-cli
eas login
npm run apk
```

Al terminar (10–20 min) EAS da un enlace para descargar el `.apk` e instalarlo en cada teléfono o tablet.

**Laptop / PC (navegador):** `npm run build:web` crea la carpeta `dist`. Arrástrala a https://app.netlify.com/drop y Netlify da una dirección web. Los archivos `public/_headers` y `_redirects` ya traen la configuración necesaria.

## Conectar la nube (Supabase)

1. Crea un proyecto gratis en https://supabase.com
2. En *SQL Editor*, ejecuta en orden los archivos de `supabase/migrations/` (`0001_…`, `0002_…`, `0003_…` para las fotos de productos y `0004_…` para precios de delivery y descuentos).
3. Pon la URL y la clave *publishable* del proyecto en `src/sync/config.ts` (Project Settings > API Keys). Nunca la clave *secret*.
4. Abre la app, toca **Crear cuenta**, y luego **Crear negocio**. Quedas como dueño.

### Personal y roles

Cada empleado crea su cuenta en la app con su correo. Luego el dueño o un gerente lo agrega en **Perfil > Personal**, eligiendo su rol y su local (o todos los locales).

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

## PedidosYa automático (Partner API)

Los pedidos de PedidosYa pueden entrar solos como ventas del canal "PedidosYa":

1. Correr `supabase/migrations/0007_pedidosya_automatico.sql` en el SQL Editor.
2. Publicar el receptor (una vez, desde la PC):
   ```
   npx supabase login
   npx supabase link --project-ref opwtnfflzdybdtvluedt
   npx supabase secrets set PEDIDOSYA_WEBHOOK_TOKEN=una-clave-larga-que-inventes
   npx supabase functions deploy pedidosya-webhook --no-verify-jwt
   ```
3. En el portal de PedidosYa (o con el ejecutivo de cuenta) registrar el webhook de pedidos:
   - URL: `https://opwtnfflzdybdtvluedt.supabase.co/functions/v1/pedidosya-webhook`
   - Token estático: la misma clave de `PEDIDOSYA_WEBHOOK_TOKEN`.
4. Enlazar la tienda de PedidosYa con el local de YOLI (tabla `delivery_links`).

Los productos se unen por SKU (= id del producto en YOLI) o por nombre igual. Cada aviso
queda en `delivery_events` con su resultado, para revisar si algo no entró.
Prueba local: `supabase/tests/pedidosya_test.sql`.

## Vender YOLI a otros negocios (suscripciones)

YOLI ya es multi-negocio: cada cliente crea su cuenta, su negocio y sus locales, y solo ve sus datos (RLS).

1. Correr `supabase/migrations/0008_suscripciones.sql` en el SQL Editor.
   - Los negocios que ya existían quedan **activos sin vencimiento**.
   - Cada negocio nuevo recibe **14 días de prueba gratis**.
2. Hacerte administrador de YOLI (una sola vez, con tu correo):
   ```sql
   insert into platform_admins (user_id)
   select id from auth.users where email = 'TU_CORREO' on conflict do nothing;
   ```
3. En la app: Perfil › **Clientes de YOLI**. Ahí ves cada negocio, su dueño, ventas de 30 días y
   su suscripción, con botones **+1 mes**, **+1 año** y **Suspender**.
4. Con la suscripción vencida o suspendida, el cliente ve la pantalla "Tu prueba terminó" y el
   servidor no acepta ventas ni gastos nuevos (sus datos no se borran).
5. Contacto para renovar: `SUPPORT_WHATSAPP` y `SUPPORT_EMAIL` en `src/sync/config.ts`.
