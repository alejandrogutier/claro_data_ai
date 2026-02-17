# Orden de Arranque Tecnico

## 1) Seguridad y base operativa
1. Mover secretos productivos a AWS Secrets Manager.
2. Mantener credenciales actuales sin rotacion por decision operativa (controladas como secretos seguros).
3. Configurar KMS y politicas IAM de minimo privilegio.

## 2) Plataforma minima productiva
1. Publicar frontend SPA en S3 y distribuir por CloudFront.
2. Levantar Cognito (User Pool + grupos).
3. Desplegar API Gateway + Lambda base con `GET /v1/health`.
4. Provisionar Aurora PostgreSQL Serverless v2.

## 3) Dominio de datos
1. Generar y versionar migracion inicial Prisma (`prisma/migrations/20260217022500_init/migration.sql`).
2. Crear tablas core de terminos, contenido, clasificaciones, analisis, auditoria y exportes.
3. Aplicar migracion en Aurora desde un runner con acceso VPC y validar indice FTS sobre `title/summary/content`.

## 4) Ingesta y procesamiento
1. Activar EventBridge cada 15 min.
2. Configurar Step Functions para orchestration.
3. Conectar SQS + DLQ para desacople y reproceso.
4. Implementar adaptadores de proveedores con fail-soft y retries.

## 5) IA y analisis
1. Integrar Bedrock Haiku 4.5 fijo.
2. Usar prompts versionados en `prompts/classification` y `prompts/analysis`.
3. Persistir outputs con trazabilidad de modelo/prompt/version.

## 6) Operacion de negocio
1. Habilitar acciones de estado: active/archived/hidden y restauracion.
2. Habilitar export CSV controlado por rol.
3. Programar digest SES diario (08:00).

## 7) Hardening y social-ready
1. Publicar OpenAPI 3.1 y pruebas de contrato.
2. Ejecutar plan de backup/restore (RPO 15m, RTO 2h).
3. Implementar interfaz de conectores para fuentes sociales futuras.
