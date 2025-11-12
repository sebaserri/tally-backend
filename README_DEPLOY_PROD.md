# Deploy a Producción – proofholderholder API

Este bundle incluye:
- `Dockerfile` (multi-stage) con **tesseract-ocr** y **poppler-utils** para OCR.
- `docker-compose.prod.yml` minimal (API únicamente; DB = RDS y S3 = AWS reales).
- `.env.prod.example` con variables requeridas.
- `.dockerignore` optimizado.

## Pre-requisitos
- **RDS Postgres** operativo (URL, usuario, password).
- **S3** bucket privado (y credenciales IAM o rol con permisos `s3:PutObject`, `s3:GetObject`).
- **Twilio** (opcional) con número emisor.

## Build & Run
```bash
# 1) Prepara env
cp .env.prod.example .env.prod
# edita valores reales: JWT_SECRET, DATABASE_URL, S3_*, Twilio

# 2) Build de imagen
docker compose -f docker-compose.prod.yml build

# 3) Migraciones Prisma (primera vez)
# Puedes ejecutar dentro de un contenedor temporal:
docker run --rm --env-file .env.prod \
  -v $(pwd):/app -w /app yourorg/proofholder-api:prod \
  sh -lc "npx prisma migrate deploy && node dist/main.js & sleep 1"

# 4) Levantar API
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

> Sugerido: usar **buildx** para multi-arquitectura
```bash
docker buildx build --platform linux/amd64 -t yourorg/proofholder-api:prod --push .
```

## Salud / healthcheck
Si agregas un endpoint `GET /health`, descomenta el `HEALTHCHECK` en el `Dockerfile` para que el orquestador reinicie el contenedor si falla.

## Logs & Monitoreo
- Configura logs de Docker (o un agente tipo CloudWatch/Stackdriver).
- Alerta por errores 5xx en reverse proxy o en logs de la app.

## Seguridad
- **JWT_SECRET** fuerte y rotado.
- **CORS** limitado a tu frontend.
- No expongas credenciales en imágenes; usa **env_file** o secretos del orquestador.
- El contenedor corre como **usuario no root** (`nodeapp`).

## Notas OCR
- `tesseract-ocr` y `poppler-utils` vienen instalados en la imagen final.
- Si no necesitas OCR, puedes eliminarlos para achicar la imagen (y quitar su `apt-get` del Dockerfile).

## Troubleshooting
- Si `argon2` (módulo nativo) fallara en tu arquitectura, asegurate de construir con `linux/amd64` o instala toolchain en el builder (ya incluido: `python3`, `make`, `g++`).  
- Errores con S3: revisa `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` y credenciales/rol.  
- DB SSL en RDS: añade `?sslmode=require` a `DATABASE_URL` si tu política lo exige.
