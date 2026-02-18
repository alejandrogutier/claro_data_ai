# STATUS

## Estado General
- Proyecto: `Inception`
- Avance global: `99%`
- Historias en curso: `CLARO-014`
- Ambiente objetivo inicial: `prod` unico en `us-east-1`
- Ultima actualizacion: `2026-02-18`

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
| CLARO-008 | done | 100% | Ninguno | Clasificacion async desplegada: SQS `classification_generation` + scheduler 15m + worker Bedrock estricto; contract+smoke en verde |
| CLARO-009 | done | 100% | Ninguno | Override manual operativo en `PATCH /v1/content/{id}/classification` con `manual-override-v1`, `model_id=manual`, actor auto-upsert y auditoria `before/after` |
| CLARO-010 | done | 100% | Ninguno | Maquina de estados operativa en single/bulk (`PATCH /state`, `POST /bulk/state`) con transicion libre auditada y errores deterministas (`404/409/422`) |
| CLARO-011 | todo | 0% | Ninguno | FTS + cursor pagination pendiente |
| CLARO-012 | done | 100% | Ninguno | Desplegado y validado en AWS: source scoring configurable (`GET/POST/PATCH`), auditoria `before/after`, score efectivo dinamico en monitor/analyze/incidents/content feed, UI `/app/config/source-scoring`, contract+smoke en verde |
| CLARO-013 | done | 100% | Ninguno | Desplegado y validado en AWS: `/v1/analysis/runs|history|runs/{id}`, idempotencia/fingerprint, worker SQS+Bedrock estricto (inference profile), historial/detalle + UI `/app/analyze/runs`, contract+smoke en verde |
| CLARO-014 | doing | 90% | SES requiere sender verificado + recipients activos (y verificados si sandbox) | Digest worker + EventBridge daily 08:00 Bogota desplegados; recipients administrables por UI/DB + estado SES visible; email best-effort segun SES sandbox/prod |
| CLARO-015 | done | 100% | Ninguno | Export async operativo (`POST /v1/exports/csv` + `GET /v1/exports/{id}`), worker SQS y URL firmada al completar |
| CLARO-016 | todo | 0% | Ninguno | Dashboards CloudWatch/X-Ray pendientes |
| CLARO-017 | done | 100% | Ninguno | OpenAPI actualizado + `npm run contract:test` + smoke business extendido (`state/bulk/classification/export`) |
| CLARO-018 | todo | 0% | Ninguno | Plugin base social-ready pendiente |
| CLARO-019 | todo | 0% | Riesgo legal/compliance | Politica de licencias pendiente |
| CLARO-020 | todo | 0% | Riesgo de privacidad | Gobernanza de datos sociales pendiente |
| CLARO-021 | done | 100% | Ninguno | Blueprint UX/UI inicial consolidado y extendido a vision social/news/competencia |
| CLARO-022 | done | 100% | Ninguno | Frontend base creado en `frontend/` con React+Vite, login Cognito Hosted UI (PKCE), app shell y guardas RBAC |
| CLARO-023 | done | 100% | Ninguno | Overview KPI real desplegado en `/v1/monitor/overview` y consumido por `/app/monitor/overview` con split claro/competencia y ventana fija 7d |
| CLARO-029 | done | 100% | Ninguno | OpenAPI alineado con `/v1/feed/news` y pipeline `openapi-typescript` operativo con cliente tipado para frontend |
| CLARO-031 | done | 100% | Ninguno | 8 rutas de configuracion operativas sin stubs criticos y validadas end-to-end contra backend desplegado en AWS |
| CLARO-032 | done | 100% | Ninguno | Monitoreo V1 completo con rutas separadas (`/app/monitor/overview`, `/app/monitor/feed-claro`, `/app/monitor/feed-competencia`) y consumo de feed limitado a 2 noticias por query |
| CLARO-033 | done | 100% | Ninguno | Motor KPI `kpi-v1` operativo (BHS 50/25/25, SOV calidad 60 + volumen 40, severidad `SEV1..SEV4`) con contract/smoke en verde |
| CLARO-034 | done | 100% | Ninguno | Modulo de analisis desplegado con `/v1/analyze/overview|channel|competitors`, rutas `/app/analyze/*`, comparativo de ventana 7d y benchmark competencia validados en `contract:test` + smoke |
| CLARO-035 | done | 100% | Ninguno | Modulo reportes V1 cerrado y desplegado: `/v1/reports/*` (templates/schedules/runs/center), worker+scheduler (SQS/EventBridge/Lambda), estado `pending_review` por confianza, pages `/app/reports/*` y validacion `contract:test` + smoke en AWS |
| CLARO-036 | done | 100% | Ninguno | End-to-end desplegado: API `/v1/monitor/incidents*`, scheduler 15m (EventBridge->SQS->Lambda), triage con notas/auditoria/SLA y UI real en `/app/monitor/incidents` con redirect desde `/app/config/alerts` |
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
5. **Riesgo**: datos historicos de cuentas/competidores incompletos para overview inicial.
   - Mitigacion: cargar catalogos base priorizados y marcar KPI sin base suficiente como `insufficient_data`.
6. **Riesgo**: umbrales de severidad pueden disparar ruido en CLARO-036.
   - Mitigacion: iniciar alertas con observacion pasiva y ajustar thresholds/cooldown con datos reales de 1 semana.
7. **Riesgo**: catalogo de recipients vacio/inactivo o SES en sandbox sin recipients verificados, por lo que notificacion/digest por correo puede quedar solo best-effort (in-app sigue operativo).
   - Mitigacion: crear recipients desde `/app/config/alerts` y verificar sender; si SES sigue en sandbox, verificar identities de recipients o solicitar production access.

## Decisiones Cerradas de Arquitectura y Producto
- AWS serverless en `us-east-1`.
- Frontend SPA React/Vite en S3 + CloudFront.
- Auth Cognito JWT + RBAC (`Admin`, `Analyst`, `Viewer`).
- IA Bedrock fijo `us.anthropic.claude-haiku-4-5-20251001-v1:0` (inference profile).
- Fuentes V1: Hootsuite + Awario + News.
- Cadencia de sincronizacion: 15 min por fuente.
- Objetivo dual: salud de marca (60%) + SOV (40%).
- KPI oficiales: `BHS`, `SOV`, `sentimiento_neto`, `riesgo_activo`.
- Reportes V1: `Web + CSV` (sin PDF).
- Zona horaria operativa: `America/Bogota`.

## Proximos Hitos
1. Ejecutar CLARO-014 (digest SES 08:00) end-to-end con sender verificado + recipients activos (y verificados si sandbox) y trazabilidad de corrida.
2. Retomar CLARO-011 (FTS + cursor pagination) para robustecer consultas operativas.
3. Preparar CLARO-016 (dashboards CloudWatch/X-Ray) para observabilidad de runtime.
