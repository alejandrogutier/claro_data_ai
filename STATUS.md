# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `98%`
- Historias en curso: `CLARO-023`
- Ambiente objetivo inicial: `prod` unico en `us-east-1`
- Ultima actualizacion: `2026-02-17`

## Estado por Historia
| Historia | Estado | Progreso | Bloqueos | Nota |
|---|---|---:|---|---|
| CLARO-001 | done | 100% | Ninguno | Secretos cargados en Secrets Manager y lectura runtime habilitada en Lambda/API |
| CLARO-002 | done | 100% | Ninguno | Terraform aplicado en AWS con recursos base productivos |
| CLARO-003 | done | 100% | Ninguno | Authorizer JWT en API Gateway + enforcement de rol por ruta en Lambda |
| CLARO-004 | done | 100% | Ninguno | Migracion inicial aplicada en Aurora via runner en VPC |
| CLARO-005 | done | 100% | Ninguno | Pipeline operativo con persistencia SQL en Aurora |
| CLARO-006 | done | 100% | Ninguno | Adaptadores endurecidos con taxonomia de errores y normalizacion defensiva |
| CLARO-007 | done | 100% | Ninguno | Replay gate por `run_id` y no-duplicado validado |
| CLARO-008 | todo | 0% | Ninguno | Integracion Bedrock runtime pendiente |
| CLARO-009 | done | 100% | Ninguno | Override manual operativo en `PATCH /v1/content/{id}/classification` con `manual-override-v1`, `model_id=manual`, actor auto-upsert y auditoria `before/after` |
| CLARO-010 | done | 100% | Ninguno | Maquina de estados operativa en single/bulk (`PATCH /state`, `POST /bulk/state`) con transicion libre auditada y errores deterministas (`404/409/422`) |
| CLARO-011 | todo | 0% | Ninguno | FTS + cursor pagination pendiente |
| CLARO-012 | todo | 0% | Ninguno | Scoring de fuente pendiente |
| CLARO-013 | todo | 0% | Ninguno | Analisis agregado pendiente |
| CLARO-014 | todo | 15% | SES requiere verificacion de identidad real de correo | SES identity creada (`digest@example.com`) |
| CLARO-015 | done | 100% | Ninguno | Export async operativo (`POST /v1/exports/csv` + `GET /v1/exports/{id}`), worker SQS y URL firmada al completar |
| CLARO-016 | todo | 0% | Ninguno | Dashboards CloudWatch/X-Ray pendientes |
| CLARO-017 | done | 100% | Ninguno | OpenAPI actualizado + `npm run contract:test` + smoke business extendido (`state/bulk/classification/export`) |
| CLARO-018 | todo | 0% | Ninguno | Plugin base social-ready pendiente |
| CLARO-019 | todo | 0% | Riesgo legal/compliance | Politica de licencias pendiente |
| CLARO-020 | todo | 0% | Riesgo de privacidad | Gobernanza de datos sociales pendiente |
| CLARO-021 | done | 100% | Ninguno | Blueprint UX/UI inicial consolidado y extendido a vision social/news/competencia |
| CLARO-022 | done | 100% | Ninguno | Frontend base creado en `frontend/` con React+Vite, login Cognito Hosted UI (PKCE), app shell y guardas RBAC |
| CLARO-023 | doing | 5% | Ninguno | Kickoff de Overview KPI real iniciado tras cierre de configuracion (`BHS`, `SOV`, `sentimiento_neto`, `riesgo_activo`) |
| CLARO-029 | done | 100% | Ninguno | OpenAPI alineado con `/v1/feed/news` y pipeline `openapi-typescript` operativo con cliente tipado para frontend |
| CLARO-031 | done | 100% | Ninguno | 8 rutas de configuracion operativas sin stubs criticos y validadas end-to-end contra backend desplegado en AWS |
| CLARO-032 | done | 100% | Ninguno | Monitoreo V1 completo con rutas separadas (`/app/monitor/overview`, `/app/monitor/feed-claro`, `/app/monitor/feed-competencia`) y consumo de feed limitado a 2 noticias por query |
| CLARO-033 | todo | 0% | Ninguno | Motor KPI y severidad pendiente (`BHS=50/25/25`, `SOV=calidad 60 + alcance 40`, `SEV1>=80`) |
| CLARO-037 | done | 100% | Ninguno | Superficie `/v1/connectors*` desplegada en runtime (`GET/PATCH/sync/runs`) y validada en `contract:test` + smoke business |
| CLARO-038 | done | 100% | Ninguno | CRUD de cuentas, competidores y taxonomias desplegado y validado (`/v1/config/accounts|competitors|taxonomies/*`, respuestas `201/409`) |
| CLARO-039 | done | 100% | Ninguno | Gobernanza de auditoria/export cerrada con `/v1/config/audit` y `/v1/config/audit/export`, sanitizacion por rol y permisos S3/KMS aplicados |
| CLARO-044 | done | 100% | Ninguno | Deploy automatico Amplify en `main` validado; `VITE_*` cargadas en branch, rewrite SPA en `200`, callback/logout Cognito agregados para dominio Amplify y login funcional en URL publica |

## Riesgos Activos y Mitigacion
1. **Riesgo**: catalogos reales aun no cargados (16 cuentas + competidores finales).
   - Mitigacion: cargar y validar antes de Sprint 3 como prerequisito de go-live.
2. **Riesgo**: calidad de narrativa automatica en reportes.
   - Mitigacion: umbral de confianza >=0.65 y fallback a `pending_review`.
3. **Riesgo**: ruido por spam/bots distorsionando KPIs.
   - Mitigacion: filtro automatico obligatorio y loop mensual de recalibracion.
4. **Riesgo**: manejo de datos sensibles en social listening.
   - Mitigacion: minimizacion/enmascaramiento PII y export completo solo para Admin.
5. **Riesgo**: definiciones KPI pueden quedar desalineadas entre negocio y calculo tecnico en CLARO-023/033.
   - Mitigacion: congelar contrato de formulas (BHS/SOV/severidad) antes de implementar agregaciones y visualizacion.
6. **Riesgo**: datos historicos de cuentas/competidores incompletos para overview inicial.
   - Mitigacion: cargar catalogos base priorizados y marcar KPI sin base suficiente como `insufficient_data`.

## Decisiones Cerradas de Arquitectura y Producto
- AWS serverless en `us-east-1`.
- Frontend SPA React/Vite en S3 + CloudFront.
- Auth Cognito JWT + RBAC (`Admin`, `Analyst`, `Viewer`).
- IA Bedrock fijo `anthropic.claude-haiku-4-5-20251001-v1:0`.
- Fuentes V1: Hootsuite + Awario + News.
- Cadencia de sincronizacion: 15 min por fuente.
- Objetivo dual: salud de marca (60%) + SOV (40%).
- KPI oficiales: `BHS`, `SOV`, `sentimiento_neto`, `riesgo_activo`.
- Reportes V1: `Web + CSV` (sin PDF).
- Zona horaria operativa: `America/Bogota`.

## Proximos Hitos
1. Implementar CLARO-023: Overview con KPI reales (`BHS`, `SOV`, `sentimiento_neto`, `riesgo_activo`) y tendencia 7d.
2. Implementar CLARO-033: motor de formulas y severidad reutilizable para monitoreo y analisis.
3. Conectar CLARO-036 para alertas de severidad sobre KPI ya calculados.
4. Retomar CLARO-013 (analysis async real) reutilizando patron de jobs y trazabilidad aplicado en export.
