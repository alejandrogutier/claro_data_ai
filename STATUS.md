# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `42%`
- Historias en curso: `CLARO-004, CLARO-005, CLARO-017`
- Ambiente objetivo inicial: `prod` unico en `us-west-2`
- Ultima actualizacion: `2026-02-17`

## Estado por Historia
| Historia | Estado | Progreso | Bloqueos | Nota |
|---|---|---:|---|---|
| CLARO-001 | done | 100% | Ninguno | Secretos cargados en Secrets Manager y lectura runtime habilitada en Lambda/API |
| CLARO-002 | done | 100% | Ninguno | Terraform aplicado en AWS con recursos base productivos |
| CLARO-003 | done | 100% | Ninguno | Authorizer JWT en API Gateway + enforcement de rol por ruta en Lambda (smoke test validado) |
| CLARO-004 | doing | 72% | Falta aplicar migracion en Aurora desde runner con acceso VPC | `prisma/migrations/20260217022500_init` creada con tablas core + indice FTS |
| CLARO-005 | doing | 55% | Falta implementar workers de negocio | EventBridge + Step Functions + SQS + DLQ desplegados; pendientes handlers de fetch/normalize/persist |
| CLARO-006 | todo | 0% | Ninguno | Adaptadores providers pendientes |
| CLARO-007 | todo | 0% | Ninguno | Dedupe/idempotencia de dominio pendiente |
| CLARO-008 | todo | 0% | Ninguno | Integracion Bedrock runtime pendiente |
| CLARO-009 | todo | 0% | Ninguno | Override de clasificacion pendiente |
| CLARO-010 | todo | 0% | Ninguno | Maquina de estados de dominio pendiente |
| CLARO-011 | todo | 0% | Ninguno | FTS + cursor pagination pendiente |
| CLARO-012 | todo | 0% | Ninguno | Scoring de fuente pendiente |
| CLARO-013 | todo | 0% | Ninguno | Analisis agregado pendiente |
| CLARO-014 | todo | 15% | SES requiere verificacion de identidad real de correo | SES identity creada (`digest@example.com`) |
| CLARO-015 | todo | 0% | Ninguno | Export CSV pendiente |
| CLARO-016 | todo | 0% | Ninguno | Dashboards CloudWatch/X-Ray pendientes |
| CLARO-017 | doing | 45% | Falta suite de pruebas de contrato | OpenAPI 3.1 base creada en `openapi/v1.yaml` |
| CLARO-018 | todo | 0% | Ninguno | Plugin base social-ready pendiente |
| CLARO-019 | todo | 0% | Riesgo legal/compliance | Politica de licencias pendiente |
| CLARO-020 | todo | 0% | Riesgo de privacidad | Gobernanza de datos sociales pendiente |

## Riesgos Activos y Mitigacion
1. **Riesgo**: secretos reales en `.env` local.
   - Mitigacion: runtime productivo ya consume Secrets Manager; `.env` queda solo para scripts locales y bootstrap controlado.
2. **Riesgo**: decision de no rotar llaves actualmente.
   - Mitigacion: mantener monitoreo y planear rotacion controlada en ventana futura sin detener operacion.
3. **Riesgo**: aplicacion de migraciones Prisma bloqueada por conectividad a Aurora en subred privada.
   - Mitigacion: ejecutar migraciones desde runner/Lambda con acceso VPC y luego automatizar `prisma migrate deploy` en pipeline.
4. **Riesgo**: almacenamiento de contenido completo y PII amplia.
   - Mitigacion: definir guardrails legales/compliance (CLARO-019/020) antes de escalar integraciones sociales.

## Decisiones Cerradas de Arquitectura
- Arquitectura AWS serverless en `us-west-2`.
- SQL principal: Aurora PostgreSQL Serverless v2 + Prisma.
- Frontend: SPA React/Vite en S3 + CloudFront.
- Auth: Cognito JWT + RBAC (`Admin`, `Analyst`, `Viewer`).
- IA: Bedrock fijo `anthropic.claude-haiku-4-5-20251001-v1:0`.
- Ingesta: scheduler cada 15 min + ejecucion manual.
- Estado de contenido: `active|archived|hidden`, reversible con auditoria.
- Secretos: gestion en Secrets Manager (`claro-data-prod/*`) sin rotacion en esta fase.

## Proximos Hitos
1. Ejecutar migracion inicial Prisma contra Aurora y crear indice FTS (CLARO-004).
2. Implementar workers funcionales de ingesta (fetch/normalize/dedupe/persist) sobre pipeline ya desplegado (CLARO-005, CLARO-006, CLARO-007).
3. Integrar clasificacion en Bedrock con versionado de prompt y persistencia (CLARO-008).
4. Publicar pruebas de contrato OpenAPI 3.1 para las rutas `/v1/*` base (CLARO-017).
