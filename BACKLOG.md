# Backlog

## Now
- CLARO-005 | doing | P0 | Pipeline ingesta programada cada 15 min | pipeline funcional desplegado (EventBridge + Step Functions + SQS + worker Lambda + S3 raw); falta persistencia SQL de dominio
- CLARO-006 | doing | P1 | Adaptadores de proveedores de noticias de APIS.md | adaptadores base implementados con retries/backoff y fail-soft; falta hardening por proveedor
- CLARO-007 | doing | P1 | Dedupe por URL canonica + persistencia unificada | dedupe canonico implementado en worker; falta idempotencia/persistencia en `content_items`
- CLARO-017 | doing | P2 | OpenAPI 3.1 + pruebas de contrato | especificacion base creada en `openapi/v1.yaml`; faltan pruebas de contrato

## Next
- CLARO-008 | todo | P1 | Clasificacion Bedrock Haiku 4.5 | implementar runtime Bedrock y persistencia
- CLARO-009 | todo | P1 | Overrides manuales de clasificacion | auditoria before/after
- CLARO-010 | todo | P1 | Estados active/archived/hidden + acciones bulk | reversion autorizada
- CLARO-011 | todo | P1 | Filtros avanzados + busqueda FTS + cursor pagination | API y UI
- CLARO-012 | todo | P1 | Source scoring basico configurable | pesos manuales, impacto en ranking
- CLARO-013 | todo | P2 | Analisis agregado y trazabilidad de ejecuciones | historial + metricas
- CLARO-014 | todo | P2 | Digest diario SES 08:00 para todos los usuarios | plantillas y job scheduler
- CLARO-015 | todo | P2 | Exportacion CSV controlada | permisos y auditoria
- CLARO-016 | todo | P2 | Dashboards operativos CloudWatch/X-Ray | sin alertas push (solo dashboard)

## Later
- CLARO-018 | todo | P3 | Base de conectores social-ready | interfaz plugin y mapeo news/social
- CLARO-019 | todo | P3 | Guardrails legales/licencia de contenido | politica y controles operativos
- CLARO-020 | todo | P3 | Gobernanza de datos sensibles social | baseline de cumplimiento

## Done (2026-02)
- CLARO-000 | done | P1 | Definicion inicial de arquitectura y plan base | direccion funcional y tecnica acordada
- CLARO-001 | done | P0 | Seguridad inicial: migrar secretos a variables seguras | secretos cargados en Secrets Manager y consumidos en runtime de Lambda; no rotacion por decision operativa
- CLARO-002 | done | P0 | Terraform base de plataforma AWS | infraestructura desplegada en AWS (KMS, S3, CloudFront, Cognito, API/Lambda, SQS, EventBridge, Step Functions, Aurora, SES, Budget)
- CLARO-003 | done | P0 | Cognito + RBAC en API Gateway | JWT authorizer + rutas privadas + enforcement de rol en Lambda validados con smoke test
- CLARO-004 | done | P0 | Aurora PostgreSQL + Prisma + esquema inicial | migracion `20260217022500_init` aplicada en Aurora via `db-migration-runner` y secreto `claro-data-prod/database` creado
