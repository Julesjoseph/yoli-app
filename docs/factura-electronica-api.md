# YOLI SOFT · Conectar un proveedor de factura electrónica (e-CF) por API

Esta guía es para el **proveedor autorizado por la DGII** (o su equipo técnico).
Explica qué le manda YOLI SOFT y qué espera de vuelta.

En YOLI SOFT el negocio configura todo en **Perfil › Factura electrónica › Otro proveedor por API**.

## 1. Cómo se conecta

| Dato | Para qué |
|---|---|
| Dirección para emitir (POST, https) | YOLI manda aquí cada factura. |
| Dirección para consultar (GET, https, opcional) | Para preguntar el estado de una factura que quedó "en proceso". Puede llevar `{id}` (el id que devolvió el proveedor) o `{encf}`. Ej.: `https://api.proveedor.com/ecf/{id}` |
| Llave (token) | Se manda en cada llamada. Por defecto `Authorization: Bearer <llave>`. El encabezado y el prefijo se pueden cambiar (ej. `x-api-key: <llave>`). La llave se guarda en el servidor; nadie la puede volver a ver. |
| Ambiente | `prueba` o `produccion`, viaja dentro de la factura (`ambiente`). Si el proveedor usa direcciones distintas para cada ambiente, el negocio cambia la dirección. |
| Formato | **Estándar YOLI** (abajo) o **igual que Alanube** (mismo cuerpo que la API de Alanube RD). |
| Numeración | **YOLI lleva la secuencia**: YOLI manda el e-NCF ya asignado (de la secuencia que autorizó la DGII). **El proveedor lo pone**: YOLI manda `encf: null` y toma el que venga en la respuesta. |

Todas las llamadas llevan `Content-Type: application/json` y `Accept: application/json`, y esperan respuesta en JSON en menos de 45 segundos.

## 2. Lo que YOLI manda (formato `yoli-ecf-1`)

Montos en RD$ con 2 decimales. Los precios de los artículos van **sin ITBIS** y por separado el ITBIS de cada línea.

```json
{
  "formato": "yoli-ecf-1",
  "ambiente": "prueba",
  "tipoEcf": "32",
  "encf": "E320000000007",
  "fechaVencimientoSecuencia": "2027-12-31",
  "fechaEmision": "2026-11-13",
  "emisor": {
    "rnc": "131000001",
    "razonSocial": "Negocio Demo SRL",
    "nombreComercial": "Negocio demo",
    "direccion": "Av. Duarte 25",
    "telefono": "8095551234",
    "correo": null
  },
  "comprador": null,
  "items": [
    {
      "linea": 1,
      "descripcion": "Café",
      "tipo": "bien",
      "cantidad": 2,
      "precioUnitarioConItbis": 118,
      "precioUnitarioSinItbis": 100,
      "tasaItbis": 18,
      "indicadorFacturacion": 1,
      "descuento": 0,
      "montoSinItbis": 200,
      "itbis": 36,
      "total": 236
    },
    {
      "linea": 2,
      "descripcion": "Propina legal (10%)",
      "tipo": "servicio",
      "cantidad": 1,
      "precioUnitarioConItbis": 20,
      "precioUnitarioSinItbis": 20,
      "tasaItbis": 0,
      "indicadorFacturacion": 4,
      "descuento": 0,
      "montoSinItbis": 20,
      "itbis": 0,
      "total": 20
    }
  ],
  "totales": {
    "montoGravado18": 200,
    "montoGravado16": 0,
    "montoGravadoTotal": 200,
    "montoExento": 20,
    "itbis18": 36,
    "itbis16": 0,
    "itbisTotal": 36,
    "descuento": 0,
    "propinaLegal": 20,
    "total": 256
  },
  "formaPago": { "codigo": 3, "nombre": "Tarjeta de débito / crédito", "monto": 256 },
  "referencia": { "ventaId": "1f0c…", "sistema": "YOLI SOFT" }
}
```

- `tipoEcf`: `"32"` factura de consumo, `"31"` crédito fiscal.
- `comprador`: solo en la 31: `{ "rncCedula": "101000001", "nombre": "Cliente SRL" }`.
- `indicadorFacturacion` (DGII): 1 = ITBIS 18 %, 2 = ITBIS 16 %, 4 = exento.
- `formaPago.codigo` (DGII): 1 efectivo, 2 cheque/transferencia, 3 tarjeta, 8 otras (PedidosYa, Uber Eats).
- `descuento` de cada línea ya está restado en `montoSinItbis`.
- La propina legal (10 %, solo consumo en el local) va como línea exenta.

## 3. Lo que YOLI espera de vuelta

Respuesta **2xx** con JSON. YOLI busca estos datos (en la raíz o dentro de `data` / `result`):

| Dato | Nombres que YOLI reconoce solo |
|---|---|
| e-NCF | `encf`, `eNCF`, `ENCF`, `numero`, `ncf` |
| Código de seguridad (6 caracteres) | `securityCode`, `codigoSeguridad`, `security_code` |
| Enlace del QR / timbre DGII | `qrUrl`, `urlQR`, `qr`, `qrCodeUrl`, `stampUrl`, `documentStampUrl` |
| Estado | `status`, `estado`, `legalStatus` |
| Id del documento (para consultar) | `id`, `trackId`, `uuid`, `documentId` |
| Mensaje | `message`, `mensaje`, `detail`, `error` |

Si el proveedor usa otros nombres, el negocio escribe la ruta en **Opciones avanzadas** (ej. `data.documento.encf`).

**Estados:** cualquier texto con *aceptado / aprobado / firmado / emitido / success* = **aceptada**;
*rechazado / error / inválido* = **rechazada**; cualquier otro (ej. *en proceso*) = **enviada** y se puede consultar después.
Si no viene estado pero sí e-NCF y código de seguridad, se toma como aceptada.

Ejemplo mínimo:

```json
{ "id": "abc-123", "encf": "E320000000007", "codigoSeguridad": "AB12CD", "estado": "Aceptado", "urlQR": "https://ecf.dgii.gov.do/…" }
```

**Errores:** responder 4xx/5xx con `{ "message": "…" }` o `{ "errors": [{ "message": "…" }] }`. YOLI le muestra ese texto al negocio
y, si YOLI llevaba la secuencia, devuelve el e-NCF para no dejar huecos.

## 4. Consulta de estado (opcional)

`GET` a la dirección de consulta (con `{id}` o `{encf}` reemplazados). La respuesta se lee igual que arriba.
