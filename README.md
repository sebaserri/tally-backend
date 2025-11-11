# Tally API — Guía de desarrollo y despliegue

API NestJS para gestionar certificados de seguro (COI), con OCR opcional y notificaciones vía SMS/email.

## 🧭 TL;DR

### Desarrollo local (hot reload)

```bash
# Infra local (Postgres + MinIO)
docker compose up -d

# API
cp .env.example .env            # ajusta credenciales locales
npm install
npm run prisma:generate
npm run prisma:dev              # agrega -- --name init si es la primera migración
npm run db:seed
npm run start:dev               # http://localhost:4000
# opcional: npx prisma studio
```

### Imágenes Docker

- `Dockerfile.slim` → imagen liviana, **sin** dependencias de OCR.
- `Dockerfile.ocr` → imagen con `tesseract-ocr` + `poppler-utils` para procesar PDFs escaneados.

```bash
docker build -f Dockerfile.slim -t tally-backend:slim .
docker build -f Dockerfile.ocr  -t tally-backend:ocr  .
```

### Despliegue (compose prod)

```bash
cp .env.example .env.prod       # completa DATABASE_URL, JWT, S3, Twilio, etc.
docker compose -f docker-compose.prod.yml build

# Migraciones
docker run --rm --env-file .env.prod \
  -v "$(pwd)":/app -w /app yourorg/tally-api:prod \
  sh -lc "npx prisma migrate deploy"

# API
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
curl -f http://localhost:4000/health
```

## 📁 Archivos clave

- `.env.example` → plantilla base para `.env` (dev) y `.env.prod` (prod).
- `docker-compose.yml` → solo infraestructura de desarrollo (Postgres + MinIO).
- `docker-compose.prod.yml` → API para producción (elige Dockerfile según OCR).
- `Dockerfile.slim` / `Dockerfile.ocr` → imágenes de runtime.
- `prisma/schema.prisma` → esquema y migraciones de base de datos.

> Usa `.env` en desarrollo y `.env.prod` en producción. No mezcles los `docker-compose`: el de dev no levanta la API; el de prod asume base externa (RDS, S3, Twilio, etc.).

## 🧪 Desarrollo local (detalle)

### 1. Infraestructura

```bash
docker compose up -d
```

- Postgres: `localhost:5432` (`postgres` / `postgres`)
- MinIO: `http://localhost:9001` (`minioadmin` / `minioadmin`)
- Crea el bucket `coi-uploads` la primera vez.

### 2. API NestJS

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:dev            # corre migraciones
npm run db:seed
npm run start:dev
```

Usuarios generados por el seed:

- `admin@example.com` / `password123` (ADMIN)
- `vendor@example.com` / `password123` (VENDOR)
- `guard@example.com` / `password123` (GUARD)

## 🔄 Prisma & base de datos

- `npm run prisma:dev` → `prisma migrate dev`
- `npm run prisma:generate` → genera el cliente
- `npm run db:seed` → ejecuta `prisma/seed.ts`
- `npx prisma studio` → UI para inspeccionar datos

Crear una migración nueva:

```bash
npm run prisma:dev -- --name nombre-migracion
```

En producción usa `npx prisma migrate deploy` dentro de la imagen que vayas a ejecutar.

## 📜 Documentación y endpoints

- Swagger UI: `http://localhost:4000/docs`
- Swagger JSON: `http://localhost:4000/docs-json`
- Healthcheck: `GET http://localhost:4000/health`

## ☁️ Despliegue

1. Copia `.env.example` a `.env.prod` y completa:
   - `DATABASE_URL`
   - Configuración S3/MinIO (`S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, etc.)
   - `JWT_SECRET` y expiraciones (`JWT_EXPIRES_IN`, etc.)
   - `ALLOWED_ORIGINS` con el dominio del front
   - Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `DEFAULT_SMS_COUNTRY_CODE`) si vas a enviar SMS
2. Elige Dockerfile en `docker-compose.prod.yml` (`Dockerfile.ocr` si necesitas OCR).
3. Construye, ejecuta migraciones y levanta la API con los comandos del TL;DR.
4. Apunta tu proxy reverso a `4000` o usa redes internas de Docker (puedes quitar `ports` si el proxy comparte red).

El healthcheck (`/health`) devuelve **200** cuando DB y almacenamiento están OK; en caso contrario responde **503**.

## 🔐 Buenas prácticas

- Mantén `JWT_SECRET` largo y cámbialo periódicamente.
- Restringe CORS (`ALLOWED_ORIGINS`) a tus dominios.
- Bucket S3 privado; la app usa pre-signed POST para subir.
- Automatiza backups de base de datos (mínimo diarios).
- Integra logs y alertas (CloudWatch, Stackdriver, etc.).

## 📨 Notificaciones & OCR

- SMS vía Twilio (configurar variables `TWILIO_*`).
- Recordatorios automáticos: job diario 09:00 (hora del servidor) que notifica vencimientos a proveedores.
- OCR:
  - PDFs con texto → `pdf-parse`.
  - PDFs escaneados/imágenes → requiere `Dockerfile.ocr` para usar `tesseract-ocr`.

## 🧩 Snippets útiles

Crear link público y enviarlo al proveedor/broker:

```bash
TOKEN=$(curl -sX POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"password123"}' \
  | jq -r .access_token)

curl -sX POST http://localhost:4000/tally/requests \
 -H "Authorization: Bearer $TOKEN" \
 -H 'Content-Type: application/json' \
 -d '{"buildingId":"<BID>","vendorId":"<VID>","ttlHours":168}'
```

Control de portería:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/access/check?vendorId=<VID>&buildingId=<BID>"
```

## 🐞 Troubleshooting rápido

- `503 /health` (DB): revisa `DATABASE_URL`, firewall/SG y migraciones.
- `503 /health` (S3): confirma bucket, credenciales y `S3_FORCE_PATH_STYLE` (`true` para MinIO, `false` en AWS).
- Subidas fallan: chequea que el bucket exista y las claves tengan permisos `s3:PutObject`.
- Twilio no envía: revisa logs y formato E.164 (`+1...`).
- Builds ARM (M1/M2): usa `--platform linux/amd64` al construir la imagen.

## 🌐 Webhooks (SendGrid / Postmark)

- SendGrid: valida `X-Twilio-Email-Event-Webhook-Signature` + `X-Twilio-Email-Event-Webhook-Timestamp` con `SENDGRID_INBOUND_SIGNING_SECRET`.
- Postmark: valida `X-Postmark-Signature` con `POSTMARK_WEBHOOK_TOKEN`.
- Si no llega firma, el guard acepta la request (modo compatibilidad). Configura los tokens para exigir validación.


---

# Auth (Autenticación, sesión y recuperación)

## Objetivo

Gestiona registro/login, emisión de **access/refresh tokens** en cookies httpOnly, **CSRF**, verificación de email y recuperación de contraseña. Mantiene auditoría indirecta vía servicios y tablas de tokens.

## Endpoints

### POST `/auth/register`

* **Quién**: público (sin token).
* **Hace**: crea `User`, hashea password, emite **access** y **refresh** (cookies), setea **CSRF cookie**, opcionalmente **envía email de verificación**.
* **Entradas**: email, password, role, (opcional) name, vendorId.
* **Devuelve**: `{ ok, user }` (perfil público).
* **DB**: `User`, `AuthToken` (EMAIL_VERIFY), `RefreshToken`.
* **Efectos**: email de verificación vía `EmailService`.

### POST `/auth/login`

* **Quién**: público.
* **Hace**: valida credenciales, exige `emailVerifiedAt` (si aplica política), emite cookies **access/refresh** + **CSRF**.
* **Entradas**: email, password.
* **Devuelve**: `{ ok, user }`.
* **DB**: lectura de `User`, inserta `RefreshToken` (hash/rotación).
* **Errores comunes**: invalid credentials, email no verificado.

### GET `/auth/me`

* **Quién**: **JWT requerido**.
* **Roles**: cualquiera con sesión.
* **Hace**: devuelve el usuario embebido en el **access token** (no lee DB).
* **Devuelve**: `{ ok, user }`.

### POST `/auth/refresh`

* **Quién**: **JWT requerido + CSRF**.
* **Roles**: cualquiera con sesión.
* **Hace**: rota el **refresh** (revoca el anterior si corresponde), emite nuevo access y refresh en cookies.
* **Entradas**: refresh en cookie httpOnly; header CSRF.
* **DB**: `RefreshToken` (verifica hash, revoca, crea nuevo).

### POST `/auth/logout`

* **Quién**: **JWT + CSRF**.
* **Hace**: revoca refresh vigente y **limpia cookies** (access/refresh/CSRF).
* **DB**: update `RefreshToken.revokedAt`.

### POST `/auth/verify-email`

* **Quién**: público (vía link).
* **Hace**: marca `User.emailVerifiedAt` y **consume** el token de verificación.
* **Entradas**: token.
* **DB**: `AuthToken`, `User`.

### POST `/auth/resend-verification`

* **Quién**: público.
* **Hace**: si el email existe, genera nuevo token de verificación y envía correo (respuesta **siempre ok**, sin filtrar existencia).
* **DB**: `AuthToken`.

### POST `/auth/forgot-password`

* **Quién**: público.
* **Hace**: crea `AuthToken` de tipo **PWD_RESET** y envía link. **No filtra existencia**.
* **DB**: `AuthToken`.

### POST `/auth/reset-password`

* **Quién**: público (link).
* **Hace**: valida token, actualiza hash de password y marca token como **usado**.
* **DB**: `AuthToken`, `User`.

**Seguridad transversal**:
Cookies httpOnly/SameSite, rotación de refresh, **JwtAuthGuard**, **CsrfGuard**, **RolesGuard** (más abajo), `EmailService` para flujos email.

---

# Access (Control de acceso / Portería)

## Objetivo

Dar respuesta **APTO/NO APTO** para ingreso de vendors a edificios y listar vendors por edificio para guardias.

## Endpoints

### GET `/access/check?vendorId=&buildingId=`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `GUARD`.
* **Hace**: evalúa si el vendor está **APTO** según último COI vigente + requisitos activos del edificio.
* **Devuelve**: `CheckResponse` con estado (`APTO|NO_APTO`) y motivos.

### GET `/access/vendors?buildingId=`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `GUARD`.
* **Hace**: listado resumido de vendors para ese edificio con estado actual (útil en portería).

**DB tocada**: `COI`, `RequirementTemplate`, `Vendor`, `Building`.

**Integraciones posibles**: usa `AccessPushService` para notificar a sistemas de control de acceso cuando cambia el estado (webhook por edificio).

---

# Audit (Auditoría)

## Objetivo

Consulta y exportación de logs operativos (aprobaciones, rechazos, cambios).

## Endpoints

### GET `/audit/logs`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: lista paginada con filtros (entity, entityId, actorId, action, rango de fechas, sort).
* **Devuelve**: `{ items, page, limit, total, hasNext }`.

### GET `/audit/logs/export`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: devuelve **CSV** con la misma query (para auditorías externas).

**DB**: `AuditLog` (con índices por entidad/id).

**Origen de eventos**: los módulos de COI escriben audit logs en las mutaciones críticas (approve/reject/update).

---

# Buildings (Edificios)

## Objetivo

CRUD mínimo de edificios (para MVP: listar y crear).

## Endpoints

### GET `/buildings`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: lista edificios.

### POST `/buildings`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: crea edificio (name, address).
* **DB**: `Building`.

---

# Requirements (Plantillas de requisitos por edificio)

## Objetivo

Definir política vigente de seguros para cada edificio (mínimos de GL/Auto/Umbrella, WC requerido, textos de holder/AI).

## Endpoints

### GET `/buildings/:buildingId/requirements`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: lista plantillas (una **activa** y versiones históricas).

### POST `/buildings/:buildingId/requirements`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: crea nueva plantilla; la activa puede ser única por edificio.
* **DB**: `RequirementTemplate` (con `@@unique([buildingId, active])`).

---

# Vendors (Proveedores)

## Objetivo

Alta de vendors, consulta, actualización de teléfono (SMS), búsqueda para guardias.

## Endpoints

### POST `/vendors`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: crea vendor (razón social, email de contacto).

### GET `/vendors/:id`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `VENDOR` (solo su propio vendor si aplica).
* **Hace**: devuelve datos del vendor.

### POST `/vendors/:id/phone`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `VENDOR` (si es su vendor).
* **Hace**: setea/actualiza teléfono para SMS.

### GET `/vendors/search?q=`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `GUARD`.
* **Hace**: búsqueda rápida/autocomplete para portería.

**DB**: `Vendor`, relación con `User` (VENDOR), referenciado por `COI` y `CoiRequest`.

---

# COIs (Gestión de certificados)

## Objetivo

CRUD relevante de COIs: listar, crear, obtener, **aprobar/rechazar** (con auditoría), exportar CSV, descargar ZIP de archivos.

## Endpoints

### GET `/cois?buildingId=&status=`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `VENDOR`.
* **Hace**: lista COIs; si es **VENDOR**, filtra por `vendorId` propio.
* **DB**: `COI` (+ `files`, `vendor`, `building`).

### POST `/cois`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `VENDOR`.
* **Hace**: crea COI; como vendor fuerza `vendorId = current.vendorId`.
  **Seguridad de archivos**: antes de crear, valida cada archivo con **AntivirusService** (y que sean PDF dentro de tamaño).
* **DB**: `COI`, `COIFile`.

### GET `/cois/:id`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `VENDOR`.
* **Hace**: obtiene COI; si `VENDOR`, solo si es suyo.

### PATCH `/cois/:id/review`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: actualiza estado/flags/notas.
  **Efectos**: escribe `AuditLog`. Si es **REJECTED**, dispara **notificación** al vendor (email/SMS vía hooks).

### PATCH `/cois/:id/approve`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: helper de aprobación (status=APPROVED) con auditoría.

### PATCH `/cois/:id/reject`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: helper de rechazo (status=REJECTED) con auditoría y notificación.

### GET `/cois/export`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: exporta CSV de COIs (con columnas estándar).

### GET `/cois/:id/files.zip`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: arma un **ZIP** con todos los archivos del COI, haciendo `GetObject` por cada `url`. Si alguno falla, agrega un `ERROR_*.txt` al ZIP.
* **Integraciones**: S3 client (o MinIO compatible).

**DB**: `COI`, `COIFile`, `AuditLog`.
**Seguridad**: Antivirus, control de vendor propio, roles.

---

# CoiRequests (Público por token para carga de COI desde vendor/broker)

## Objetivo

Permitir que un vendor suba un COI **sin autenticarse** mediante un **token temporal** (generado por ADMIN).

## Endpoints

### POST `/coi/requests`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: genera token (TTL configurable) para `buildingId + vendorId`.
  **Efectos**: puede disparar **correo** al contacto del vendor con link público.

### GET `/coi/requests/:token`

* **Quién**: público con token.
* **Hace**: devuelve **meta** (vendor, edificio, requisitos activos, expiración) para render de landing pública.

### GET `/coi/requests/:token/presign?mime=`

* **Quién**: público con token.
* **Hace**: devuelve **POST presignado** a S3/MinIO para subir PDFs (sin pasar por backend).

### POST `/coi/requests/:token/submit`

* **Quién**: público con token.
* **Hace**: valida token y **antivirus** de cada archivo (descargando desde S3), crea el **COI** y marca el request como **used**.
* **DB**: `CoiRequest`, `COI`, `COIFile`.

**Seguridad**: token único con `expiresAt` y `usedAt`, antivirus obligatorio, bucket restringido.

---

# Files (Subidas a S3/MinIO)

## Objetivo

Emitir **presigned POST** para subir archivos directo al bucket, reduciendo superficie del backend.

## Endpoint

### GET `/files/presign?mime=application/pdf`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`, `VENDOR`.
* **Hace**: devuelve `{ url, fields, key, bucket }` para subir por HTML form-data directo a S3/MinIO.
* **Políticas**: puede limitar tipos y tamaño en server; antivirus se ejecuta al **usar** el archivo (p.ej., al crear COI).

---

# Extract (OCR/IA sobre COIs)

## Objetivo

Leer PDF (en S3) con **AWS Textract**, aplicar parser ACORD 25, producir **sugerencias** con **score de confianza** y permitir **aplicar** campos al COI, con auditoría indirecta (vía COIs).

## Endpoints

### POST `/extract/coi/:id`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: corre pipeline de extracción:

  1. Textract (líneas + key-values)
  2. Parser ACORD 25 por secciones (General/Auto/Umbrella)
  3. Regex/heurísticas para fechas y montos
  4. Score de confianza y **evidencia** (texto/linea)
* **Devuelve**: `ExtractResult` con `fields`, `confidence`, `raw`.

### PATCH `/extract/coi/:id/apply`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: aplica los campos seleccionados al COI (ej.: fechas, límites, asegurado, holder), manteniendo reglas de negocio y auditoría en la capa de COIs.

**Integraciones**: `TextractClient`, adaptadores OCR alternativos (Tesseract), heurísticas ACORD.

---

# Brokers (Ingesta por Email/API)

## Objetivo

Permitir que brokers envíen COIs de forma automatizada, vía **webhook de email** o **API** con clave.

## Endpoints

### POST `/brokers/email-in`

* **Quién**: externo (webhook).
* **Seguridad**: **WebhookSignatureGuard** (SendGrid/Postmark). Si no hay secreto configurado, **log y permite** (modo dev).
* **Hace**: parsea el evento, registra entrada en `BrokerInbox`, y deja los archivos disponibles para adjuntarlos a COIs (flujo posterior).

### POST `/brokers/api/upload`

* **Quién**: externo (brokers).
* **Seguridad**: header `X-API-Key` (comparación con env).
* **Hace**: ingesta archivos/metadata vía API; crea entrada en `BrokerInbox` y prepara anexos.

**DB**: `BrokerInbox` con `status` (`RECEIVED|PARSED|ATTACHED|ERROR`), `meta` JSON.

---

# Notifications (SMS/Email utilitarios)

## Objetivo

Servicios de notificación; en el MVP, **SMS de prueba** y hooks para eventos de COI.

## Endpoint

### POST `/notifications/test-sms`

* **Quién**: **JWT**.
* **Roles**: `ADMIN`.
* **Hace**: envía SMS de prueba (`to`, `message`) usando el proveedor configurado.
* **DB**: opcional `NotificationLog` para evitar duplicados (también usado por recordatorios de expiración D30/D15/D7).

**Hooks reales**: en **COIs** (p.ej., on reject) y en **CoiRequests.create** (invita a vendor por email).

---

# Files / Seguridad adicional

* **AntivirusService**

  * Verifica tamaño y tipo (PDF), escanea con ClamAV (si `AV_ENABLED`), loggea y bloquea archivos infectados.
  * Usado en: **COIs.create**, **CoiRequests.submit**.

* **WebhookSignatureGuard**

  * Valida HMAC de SendGrid / Postmark (si secretos configurados).
  * Falla **soft** si falta configuración (para desarrollo).

* **AccessPushService**

  * Postea a un **webhook** por edificio cada vez que cambia el estado **APTO/NO APTO** (por ejemplo, al aprobar/rechazar un COI).

* **RolesGuard / JwtAuthGuard / CsrfGuard**

  * `RolesGuard`: autoriza por `@Roles(...)`.
  * `JwtAuthGuard`: exige access token.
  * `CsrfGuard`: protege endpoints sensibles de sesión (refresh/logout) con **doble submit**.

---

# Modelos y relaciones relevantes (visión funcional)

* **User**: con `role` (`ADMIN|VENDOR|GUARD`), `vendorId` opcional y `emailVerifiedAt`.
* **Vendor**: empresa; tiene `users`, `cois`, `coiRequests`.
* **Building**: edificio; tiene `requirements`, `cois`, `coiRequests`.
* **RequirementTemplate**: política por edificio (una activa).
* **COI** + **COIFile**: certificado y sus PDFs/endorsements.
* **CoiRequest**: tokens públicos (TTL, usedAt) para subir COI sin login.
* **AuthToken**: tokens funcionales (`EMAIL_VERIFY`, `PWD_RESET`).
* **RefreshToken**: refresh rotables con hash, expiración y revocación.
* **AuditLog**, **NotificationLog**, **BrokerInbox**, **BuildingIntegration**.

---

# Resumen ejecutivo por módulo

* **Auth**: alta/login, cookies seguras, refresh rotado, verificación email y reseteo de password.
* **Access**: decisiones APTO/NO APTO y listas para portería.
* **Audit**: consulta/export de logs de acciones clave.
* **Buildings/Requirements**: inventario de edificios y su política activa.
* **Vendors**: creación, consulta, teléfono, búsqueda rápida.
* **COIs**: lifecycle completo (crear, ver, aprobar/rechazar, exportar, descargar ZIP).
* **CoiRequests**: onboarding público por token con antivirus y presign a S3.
* **Files**: presign general para subidas seguras.
* **Extract (OCR/IA)**: extrae y propone campos ACORD 25 con score y evidencia.
* **Brokers**: ingesta automatizada por email/API con firma.
* **Notifications**: utilitarios de comunicación y hooks.
* **Seguridad transversal**: antivirus, roles, JWT/CSRF, webhooks firmados.


