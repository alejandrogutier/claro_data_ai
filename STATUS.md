# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `18%`
- Historias en curso: `CLARO-001, CLARO-002, CLARO-004, CLARO-017`
- Ambiente objetivo inicial: `prod` unico en `us-west-2`
- Ultima actualizacion: `2026-02-16`

## Estado por Historia
| Historia | Estado | Progreso | Bloqueos | Nota |
|---|---|---:|---|---|
| CLARO-001 | doing | 35% | Rotacion real de credenciales pendiente fuera del repo | Base documental y checklist de seguridad creados (`SECURITY_ROTATION.md`, `.env.example`, `.gitignore`) |
| CLARO-002 | doing | 55% | Requiere valores reales de red/artefactos para plan/apply | Terraform baseline validado en `infra/terraform` |
| CLARO-003 | todo | 15% | Definir authorizer JWT en API Gateway y claims mapping | Esqueleto RBAC inicial en backend TS |
| CLARO-004 | doing | 40% | Falta migracion ejecutada contra Aurora y FTS SQL real | `prisma/schema.prisma` con dominio base y auditoria |
| CLARO-005 | todo | 25% | Falta implementar workers y pasos de negocio | EventBridge + Step Functions + SQS definidos en IaC |
| CLARO-006 | todo | 0% | Ninguno | Adaptadores providers pendientes |
| CLARO-007 | todo | 0% | Ninguno | Dedupe/idempotencia de dominio pendiente |
| CLARO-008 | todo | 0% | Ninguno | Integracion Bedrock runtime pendiente |
| CLARO-009 | todo | 0% | Ninguno | Override de clasificacion pendiente |
| CLARO-010 | todo | 0% | Ninguno | Maquina de estados de dominio pendiente |
| CLARO-011 | todo | 0% | Ninguno | FTS + cursor pagination pendiente |
| CLARO-012 | todo | 0% | Ninguno | Scoring de fuente pendiente |
| CLARO-013 | todo | 0% | Ninguno | Analisis agregado pendiente |
| CLARO-014 | todo | 0% | Ninguno | Digest SES pendiente |
| CLARO-015 | todo | 0% | Ninguno | Export CSV pendiente |
| CLARO-016 | todo | 0% | Ninguno | Dashboards CloudWatch/X-Ray pendientes |
| CLARO-017 | doing | 45% | Falta suite de pruebas de contrato | OpenAPI 3.1 base creada en `openapi/v1.yaml` |
| CLARO-018 | todo | 0% | Ninguno | Plugin base social-ready pendiente |
| CLARO-019 | todo | 0% | Riesgo legal/compliance | Politica de licencias pendiente |
| CLARO-020 | todo | 0% | Riesgo de privacidad | Gobernanza de datos sociales pendiente |

## Riesgos Activos y Mitigacion
1. **Riesgo**: llaves y secretos en `.env`.
   - Mitigacion: mover a Secrets Manager, rotar credenciales y eliminar secretos reales del entorno de desarrollo compartido.
2. **Riesgo**: almacenamiento de contenido completo y PII amplia.
   - Mitigacion: definir guardrails legales/compliance (CLARO-019/020) antes de escalar integraciones sociales.
3. **Riesgo**: ambiente unico `prod` sin staging.
   - Mitigacion: IaC estricta, pruebas de contrato y pipeline con gates de calidad.

## Decisiones Cerradas de Arquitectura
- Arquitectura AWS serverless en `us-west-2`.
- SQL principal: Aurora PostgreSQL Serverless v2 + Prisma.
- Frontend: SPA React/Vite en S3 + CloudFront.
- Auth: Cognito JWT + RBAC (`Admin`, `Analyst`, `Viewer`).
- IA: Bedrock fijo `anthropic.claude-haiku-4-5-20251001-v1:0`.
- Ingesta: scheduler cada 15 min + ejecucion manual.
- Estado de contenido: `active|archived|hidden`, reversible con auditoria.

## Proximos Hitos
1. Completar CLARO-001 con rotacion real de credenciales y Secrets Manager activo.
2. Ejecutar primer `terraform plan` con `terraform.tfvars` real y cerrar CLARO-002.
3. Conectar Prisma a Aurora y generar migracion inicial (CLARO-004).
4. Implementar endpoints funcionales prioritarios (`/v1/terms`, `/v1/content`, `/v1/ingestion/runs`).
