# COI API — Guía de desarrollo y despliegue

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
docker build -f Dockerfile.slim -t coi-backend:slim .
docker build -f Dockerfile.ocr  -t coi-backend:ocr  .
```

### Despliegue (compose prod)

```bash
cp .env.example .env.prod       # completa DATABASE_URL, JWT, S3, Twilio, etc.
docker compose -f docker-compose.prod.yml build

# Migraciones
docker run --rm --env-file .env.prod \
  -v "$(pwd)":/app -w /app yourorg/coi-api:prod \
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

curl -sX POST http://localhost:4000/coi/requests \
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
