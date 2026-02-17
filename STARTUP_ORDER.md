# Orden de Arranque Tecnico

## 1) Seguridad y base operativa
1. Mantener secretos productivos en AWS Secrets Manager.
2. Mantener cifrado KMS y politicas IAM de minimo privilegio.
3. Definir guardrails de PII y exportes por rol (Admin completo, resto sanitizado).

## 2) Plataforma minima productiva
1. Publicar frontend SPA en S3 + CloudFront.
2. Levantar Cognito (User Pool + grupos Admin/Analyst/Viewer).
3. Desplegar API Gateway + Lambda base con `GET /v1/health`.
4. Provisionar Aurora PostgreSQL Serverless v2.

## 3) Dominio de datos y contratos
1. Mantener migraciones Prisma versionadas.
2. Consolidar schema para social/news + auditoria + reportes.
3. Alinear OpenAPI 3.1 con runtime real (`/v1/*`) y pruebas de contrato.

## 4) Ingestion multifuente
1. Activar pull programado cada 15 min para Hootsuite, Awario y News.
2. Orquestar con Step Functions + SQS + DLQ.
3. Implementar normalizacion/dedupe cross-source (`source_post_id` canonico + fallback).
4. Exponer health de conectores para operacion.

## 5) Configuracion de negocio (solo Admin)
1. Habilitar pantallas de configuracion:
   - conectores,
   - cuentas,
   - competidores,
   - query builder versionado,
   - taxonomias,
   - reglas de alerta,
   - plantillas/destinatarios,
   - auditoria de configuracion.
2. Cargar catalogos reales antes de go-live (16 cuentas + competidores finales).

## 6) Monitoreo y analitica
1. Habilitar overview con KPIs oficiales (`BHS`, `SOV`, `sentimiento_neto`, `riesgo_activo`).
2. Habilitar feed principal Claro (`Owned/Earned/News`) y feed competencia separado.
3. Implementar modelo de severidad (`SEV1>=80`, `SEV2>=60`) con cooldown 60 min.
4. Aplicar filtro anti spam/bots y loop mensual de recalibracion.

## 7) Reportes y operacion
1. Activar reportes automaticos (diario 08:00, semanal lunes 08:00, mensual dia 1 08:00).
2. Salida V1: `Web + CSV`.
3. Narrativa IA automatica con umbral de confianza >=0.65 y fallback `pending_review`.
4. Versionado de reportes obligatorio y comparticion externa solo por listas aprobadas.

## 8) Validacion final y release
1. Ejecutar UAT de 2 semanas.
2. Ejecutar piloto controlado de 1 semana.
3. Liberar solo con criterios de go-live completos:
   - 16 cuentas activas,
   - set final de competidores,
   - KPIs estables,
   - reporteria operativa.
