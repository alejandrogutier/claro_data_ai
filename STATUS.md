# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `34%`
- Historias en curso: `CLARO-001, CLARO-004, CLARO-017`
- Ambiente objetivo inicial: `prod` unico en `us-west-2`
- Ultima actualizacion: `2026-02-16`

## Estado por Historia
| Historia | Estado | Progreso | Bloqueos | Nota |
|---|---|---:|---|---|
| CLARO-001 | doing | 75% | Falta lectura de secretos en runtime por Lambda | Secretos cargados en Secrets Manager; decision actual: no rotacion de llaves |
| CLARO-002 | done | 100% | Ninguno | Terraform aplicado en AWS con recursos base productivos |
| CLARO-003 | todo | 20% | Falta authorizer JWT en API Gateway | RBAC base en codigo, falta enforcement completo |
| CLARO-004 | doing | 60% | Falta migracion Prisma real e indice FTS SQL | Aurora Serverless v2 desplegado y endpoint disponible |
| CLARO-005 | todo | 45% | Falta implementar workers de negocio | EventBridge + Step Functions + SQS + DLQ desplegados |
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
   - Mitigacion: secretos ya migrados a Secrets Manager; siguiente paso mover runtime a lectura directa desde Secrets Manager y minimizar uso de `.env`.
2. **Riesgo**: decision de no rotar llaves actualmente.
   - Mitigacion: mantener monitoreo y planear rotacion controlada en ventana futura sin detener operacion.
3. **Riesgo**: almacenamiento de contenido completo y PII amplia.
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
1. Completar CLARO-001: implementar lectura real de secretos en Lambda/API.
2. Ejecutar migracion inicial Prisma contra Aurora y crear indice FTS (CLARO-004).
3. Activar authorizer JWT Cognito y permisos por ruta (CLARO-003).
4. Implementar pipeline funcional de ingesta y clasificacion (CLARO-005, CLARO-006, CLARO-008).
