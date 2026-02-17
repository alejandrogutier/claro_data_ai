# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `76%`
- Historias en curso: `CLARO-017`
- Ambiente objetivo inicial: `prod` unico en `us-east-1`
- Ultima actualizacion: `2026-02-17`

## Estado por Historia
| Historia | Estado | Progreso | Bloqueos | Nota |
|---|---|---:|---|---|
| CLARO-001 | done | 100% | Ninguno | Secretos cargados en Secrets Manager y lectura runtime habilitada en Lambda/API |
| CLARO-002 | done | 100% | Ninguno | Terraform aplicado en AWS con recursos base productivos |
| CLARO-003 | done | 100% | Ninguno | Authorizer JWT en API Gateway + enforcement de rol por ruta en Lambda (smoke test validado) |
| CLARO-004 | done | 100% | Ninguno | Migracion inicial aplicada en Aurora via Lambda runner en VPC, incluyendo indice FTS y registro `_prisma_migrations` |
| CLARO-005 | done | 100% | Ninguno | Pipeline operativo con persistencia SQL en Aurora (`IngestionRun`, `IngestionRunItem`, `ContentItem`) validada en corrida manual |
| CLARO-006 | done | 100% | Ninguno | Adaptadores endurecidos con taxonomia de errores y normalizacion defensiva de payload antes de persistencia |
| CLARO-007 | done | 100% | Ninguno | `IngestionRunContentLink` + replay gate por `run_id` + validacion smoke de no duplicado en replay sobre corrida `completed` |
| CLARO-008 | todo | 0% | Ninguno | Integracion Bedrock runtime pendiente |
| CLARO-009 | todo | 0% | Ninguno | Override de clasificacion pendiente |
| CLARO-010 | todo | 0% | Ninguno | Maquina de estados de dominio pendiente |
| CLARO-011 | todo | 0% | Ninguno | FTS + cursor pagination pendiente |
| CLARO-012 | todo | 0% | Ninguno | Scoring de fuente pendiente |
| CLARO-013 | todo | 0% | Ninguno | Analisis agregado pendiente |
| CLARO-014 | todo | 15% | SES requiere verificacion de identidad real de correo | SES identity creada (`digest@example.com`) |
| CLARO-015 | todo | 0% | Ninguno | Export CSV pendiente |
| CLARO-016 | todo | 0% | Ninguno | Dashboards CloudWatch/X-Ray pendientes |
| CLARO-017 | doing | 78% | Falta convertir smoke en contrato automatizado estricto por endpoint | OpenAPI alineado con runtime (`us-east-1`), validacion estructural local y smoke business (`terms/content/meta/replay`) implementados |
| CLARO-018 | todo | 0% | Ninguno | Plugin base social-ready pendiente |
| CLARO-019 | todo | 0% | Riesgo legal/compliance | Politica de licencias pendiente |
| CLARO-020 | todo | 0% | Riesgo de privacidad | Gobernanza de datos sociales pendiente |

## Riesgos Activos y Mitigacion
1. **Riesgo**: secretos reales en `.env` local.
   - Mitigacion: runtime productivo ya consume Secrets Manager; `.env` queda solo para scripts locales y bootstrap controlado.
2. **Riesgo**: decision de no rotar llaves actualmente.
   - Mitigacion: mantener monitoreo y planear rotacion controlada en ventana futura sin detener operacion.
3. **Riesgo**: la corrida de Step Functions termina antes que el worker SQS (asincronia), lo que puede confundir monitoreo operacional.
   - Mitigacion: monitorear estado real de `IngestionRun` en DB para cierre operativo y no solo `execution` de Step Functions.
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
1. Cerrar CLARO-017 con pruebas de contrato automatizadas por endpoint `/v1/*` (sin depender solo de smoke shell).
2. Integrar clasificacion en Bedrock con versionado de prompt y persistencia (CLARO-008).
3. Implementar overrides manuales y trazabilidad `before/after` (CLARO-009).
4. Implementar maquina de estados operativa y acciones bulk completas (CLARO-010).
