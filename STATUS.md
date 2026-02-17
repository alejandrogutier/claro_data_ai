# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `53%`
- Historias en curso: `CLARO-005, CLARO-006, CLARO-007, CLARO-017`
- Ambiente objetivo inicial: `prod` unico en `us-east-1`
- Ultima actualizacion: `2026-02-17`

## Estado por Historia
| Historia | Estado | Progreso | Bloqueos | Nota |
|---|---|---:|---|---|
| CLARO-001 | done | 100% | Ninguno | Secretos cargados en Secrets Manager y lectura runtime habilitada en Lambda/API |
| CLARO-002 | done | 100% | Ninguno | Terraform aplicado en AWS con recursos base productivos |
| CLARO-003 | done | 100% | Ninguno | Authorizer JWT en API Gateway + enforcement de rol por ruta en Lambda (smoke test validado) |
| CLARO-004 | done | 100% | Ninguno | Migracion inicial aplicada en Aurora via Lambda runner en VPC, incluyendo indice FTS y registro `_prisma_migrations` |
| CLARO-005 | doing | 72% | Falta persistencia de ingesta en tablas de dominio | Step Functions -> SQS -> worker Lambda operativo y validado con corrida manual |
| CLARO-006 | doing | 45% | Falta hardening por proveedor y normalizacion avanzada | Adaptadores de APIS.md implementados con retry/backoff y manejo fail-soft |
| CLARO-007 | doing | 35% | Falta llave de idempotencia persistida en SQL | Dedupe por URL canonica implementado en worker antes de persistencia raw |
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
3. **Riesgo**: persistencia SQL de ingesta aun no cableada en runtime de negocio.
   - Mitigacion: siguiente sprint enfocado en `content_items`, `ingestion_runs` e idempotencia en DB.
4. **Riesgo**: almacenamiento de contenido completo y PII amplia.
   - Mitigacion: definir guardrails legales/compliance (CLARO-019/020) antes de escalar integraciones sociales.

## Decisiones Cerradas de Arquitectura
- Arquitectura AWS serverless en `us-east-1` (cuenta productiva actual).
- SQL principal: Aurora PostgreSQL Serverless v2 + Prisma.
- Frontend: SPA React/Vite en S3 + CloudFront.
- Auth: Cognito JWT + RBAC (`Admin`, `Analyst`, `Viewer`).
- IA: Bedrock fijo `anthropic.claude-haiku-4-5-20251001-v1:0`.
- Ingesta: scheduler cada 15 min + ejecucion manual.
- Estado de contenido: `active|archived|hidden`, reversible con auditoria.
- Secretos: gestion en Secrets Manager (`claro-data-prod/*` + `claro-data-prod/database`) sin rotacion en esta fase.

## Proximos Hitos
1. Persistir ingesta en Aurora (`ingestion_runs`, `content_items`) con idempotencia por URL canonica (CLARO-005/007).
2. Endurecer adaptadores por proveedor y completar normalizacion de campos faltantes (CLARO-006).
3. Integrar clasificacion en Bedrock con versionado de prompt y persistencia (CLARO-008).
4. Publicar pruebas de contrato OpenAPI 3.1 para las rutas `/v1/*` base (CLARO-017).
