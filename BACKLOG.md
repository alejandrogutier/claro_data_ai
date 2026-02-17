# Backlog

## Relacion obligatoria con UX_PLANNING.md
Este backlog gobierna la ejecucion. `UX_PLANNING.md` gobierna el diseno funcional. Se usan juntos.

Reglas para arranque de desarrollo front:
1. Ninguna historia `CLARO-0xx` de front inicia sin secciones UX asociadas.
2. Todo PR debe declarar `Historia + Secciones UX` impactadas.
3. Si cambia el alcance UX de una historia, se actualizan ambos archivos en el mismo PR.

## Matriz de trazabilidad Front (Backlog -> UX)
| Historia | Modulo | Secciones UX |
|---|---|---|
| CLARO-022 | Shell/auth/routing | 6, 7, 20, 26 |
| CLARO-023 | Overview Salud de Marca | 9.1, 12, 21.2 |
| CLARO-031 | Configuracion (8 pantallas) | 8, 21.1 |
| CLARO-032 | Monitoreo (feeds + triage) | 9, 21.2 |
| CLARO-033 | Motor KPI y severidad | 12, 21.2 |
| CLARO-034 | Analisis (3 paginas) | 10, 21.3 |
| CLARO-035 | Reportes (3 paginas) | 11, 16, 21.4 |
| CLARO-036 | Alertas e incidentes | 9.4, 12.4, 21.2 |
| CLARO-037 | Integracion conectores + dedupe | 4, 8.1, 14 |
| CLARO-038 | Catalogos Admin | 8.2, 8.3, 8.5 |
| CLARO-039 | Gobernanza de datos/exportes | 17, 21.4 |
| CLARO-040 | Calidad semantica | 13 |
| CLARO-041 | Adopcion UX | 18, 26, 27 |
| CLARO-042 | Go-live readiness | 23, 24, 27 |

## Matriz inversa UX -> Backlog (planeacion)
| Seccion UX | Historias backlog |
|---|---|
| 8 (Configuracion) | CLARO-031, CLARO-037, CLARO-038, CLARO-039 |
| 9 (Monitoreo) | CLARO-023, CLARO-032, CLARO-033, CLARO-036, CLARO-040 |
| 10 (Analisis) | CLARO-034, CLARO-033 |
| 11 (Reportes) | CLARO-035, CLARO-039, CLARO-042 |
| 12 (KPI/formulas) | CLARO-023, CLARO-033, CLARO-036 |
| 13 (Calidad de senal) | CLARO-040, CLARO-032 |
| 16 (Narrativa IA) | CLARO-035, CLARO-039 |
| 18 (Observabilidad UX) | CLARO-022, CLARO-032, CLARO-041 |
| 23-24 (Go-live) | CLARO-042, CLARO-037, CLARO-038 |
| 26-27 (DoR/DoD y arranque) | CLARO-022, CLARO-031, CLARO-042 |

## Contrato de ejecucion Front por historia (obligatorio)
Este contrato se usa junto a `UX_PLANNING.md` secciones `2.3`, `7.4`, `21`, `26` y `27.1`.

| Historia | Pantallas/Rutas clave | Dependencias API/datos | Salida verificable para cerrar |
|---|---|---|---|
| CLARO-022 | shell + rutas `/app/*` | CLARO-003, CLARO-029 | auth/routing/RBAC operativo por rol |
| CLARO-031 | `/app/config/*` (8 pantallas) | CLARO-037, CLARO-038, CLARO-039 | 8 pantallas con CRUD base y auditoria visible |
| CLARO-032 | `/app/monitor/overview`, `/app/monitor/feed-*` | CLARO-005, CLARO-006, CLARO-007, CLARO-011 | monitoreo claro/competencia separado y estable |
| CLARO-033 | KPIs en monitor + analisis | CLARO-012, CLARO-013 | BHS/SOV/severidad calculados y trazables |
| CLARO-034 | `/app/analyze/*` | CLARO-013, CLARO-011 | 3 paginas de analisis con drill-down |
| CLARO-035 | `/app/reports/*` | CLARO-014, CLARO-015 | centro + plantillas + programacion de reportes |
| CLARO-036 | `/app/monitor/incidents` | CLARO-010, CLARO-012 | alertas e incidentes con SLA visible |
| CLARO-039 | exportes en reportes/config-audit | CLARO-015 | CSV gobernado (sanitizado, limite, permisos) |
| CLARO-041 | puntos de ayuda in-app | CLARO-023, CLARO-033 | diccionario KPI y tour por rol funcional |
| CLARO-042 | checklist transversal | CLARO-037, CLARO-038, CLARO-035 | gate go-live completo y aprobado |

## Now
- CLARO-012 | doing | P1 | Source scoring basico configurable | slice parcial aplicado en CLARO-036 para alertas (`riesgo_ponderado` y severidad por scope); falta llevarlo al ranking global y a ranking/analisis integral

## Next
- CLARO-040 | todo | P2 | Loop de calidad semantica | falso positivo con reason code + recalibracion mensual de reglas/umbrales. UX_REF: 13
- CLARO-041 | todo | P2 | UX de adopcion | diccionario de KPI en app + tour guiado basico por rol. UX_REF: 18, 26, 27
- CLARO-042 | todo | P1 | Go-live readiness social | gate con 16 cuentas activas + set final competidores + UAT 2 semanas + piloto 1 semana. UX_REF: 23, 24, 27
- CLARO-008 | todo | P1 | Clasificacion Bedrock Haiku 4.5 | implementar runtime Bedrock y persistencia
- CLARO-011 | todo | P1 | Filtros avanzados + busqueda FTS + cursor pagination | completar endpoint detalle y comportamiento UX con calidad operativa
- CLARO-013 | todo | P2 | Analisis agregado y trazabilidad de ejecuciones | narrativa, riesgos, oportunidades e historial de runs
- CLARO-014 | todo | P2 | Digest diario SES 08:00 | resumen operativo diario con trazabilidad de corrida
- CLARO-016 | todo | P2 | Dashboards operativos CloudWatch/X-Ray | tableros de operacion sin alertas push externas en V1

## Arranque Front (orden recomendado)
1. CLARO-022 + CLARO-031
2. CLARO-037 + CLARO-038
3. CLARO-032 + CLARO-023
4. CLARO-033 + CLARO-036
5. CLARO-034
6. CLARO-035 + CLARO-039
7. CLARO-041 + CLARO-042

Referencia de detalle: `UX_PLANNING.md` seccion 27.

## Gate DoR/DoD para mover estados en Backlog
Antes de mover `todo` -> `doing`:
1. Validar DoR en `UX_PLANNING.md` seccion `26.1`.
2. Confirmar UMDF completa en `UX_PLANNING.md` seccion `2.3`.

Antes de mover `doing` -> `done`:
1. Validar DoD en `UX_PLANNING.md` seccion `26.2`.
2. Registrar en notas la salida verificable usando `UX_PLANNING.md` seccion `27.1`.

## Later
- CLARO-018 | todo | P3 | Base de conectores social-ready extendidos | interfaz plugin y mapeo avanzado news/social adicionales
- CLARO-019 | todo | P3 | Guardrails legales/licencia de contenido | politica y controles operativos para contenido de terceros
- CLARO-020 | todo | P3 | Gobernanza de datos sensibles social | baseline de cumplimiento y privacidad reforzada
- CLARO-030 | todo | P3 | Hardening post-MVP UX/UI | refinamiento avanzado de experiencia y performance
- CLARO-043 | todo | P3 | Integracion paid media y CRM | fuera de alcance V1, evaluar en fase posterior

## Done (2026-02)
- CLARO-000 | done | P1 | Definicion inicial de arquitectura y plan base | direccion funcional y tecnica acordada
- CLARO-001 | done | P0 | Seguridad inicial: migrar secretos a variables seguras | secretos cargados en Secrets Manager y consumidos en runtime de Lambda; no rotacion por decision operativa
- CLARO-002 | done | P0 | Terraform base de plataforma AWS | infraestructura desplegada en AWS (KMS, S3, CloudFront, Cognito, API/Lambda, SQS, EventBridge, Step Functions, Aurora, SES, Budget)
- CLARO-003 | done | P0 | Cognito + RBAC en API Gateway | JWT authorizer + rutas privadas + enforcement de rol en Lambda validados con smoke test
- CLARO-004 | done | P0 | Aurora PostgreSQL + Prisma + esquema inicial | migracion `20260217022500_init` aplicada en Aurora via `db-migration-runner` y secreto `claro-data-prod/database` creado
- CLARO-005 | done | P0 | Pipeline ingesta programada cada 15 min | corrida manual y scheduler operativos con persistencia SQL en `IngestionRun`, `IngestionRunItem` y `ContentItem`
- CLARO-006 | done | P1 | Adaptadores de proveedores de noticias de APIS.md | taxonomia de errores (`rate_limit|auth|timeout|upstream_5xx|schema|unknown`), truncado seguro de campos y metricas unificadas por proveedor
- CLARO-007 | done | P1 | Dedupe por URL canonica + persistencia unificada | tabla `IngestionRunContentLink` + replay gate por `run_id` + verificacion de no-duplicado en replay sobre corrida `completed`
- CLARO-021 | done | P1 | Blueprint UX/UI Analyst-first inicial | documento base creado y luego extendido a vision social+competencia+reportes
- CLARO-022 | done | P1 | Frontend base React/Vite + auth Cognito Hosted UI | creado frontend en `frontend/` con shell, login Cognito PKCE, routing y guardas RBAC base (`Admin|Analyst|Viewer`)
- CLARO-029 | done | P1 | Paridad contrato API + cliente tipado frontend | OpenAPI alineado con `/v1/feed/news`, script `openapi:types` y cliente FE tipado generado desde contrato
- CLARO-009 | done | P2 | Overrides manuales de clasificacion | endpoint `PATCH /v1/content/{id}/classification` operativo con `manual-override-v1`, auditoria `before/after` y actor auto-upsert desde JWT
- CLARO-010 | done | P1 | Maquina de estados active/archived/hidden + acciones bulk | endpoints single/bulk operativos con transiciones auditadas (`ContentStateEvent` + `AuditLog`) y manejo deterministico de errores (`404/409/422`)
- CLARO-015 | done | P2 | Exportacion CSV controlada | flujo async real (`POST /v1/exports/csv` + `GET /v1/exports/{id}`), worker SQS, persistencia `ExportJob` y URL firmada en `completed`
- CLARO-017 | done | P1 | OpenAPI 3.1 + pruebas de contrato | contrato actualizado (`/v1/exports/{id}` + errores mutables), `npm run contract:test` y smoke business extendido (`state/bulk/classification/export`)
- CLARO-032 | done | P1 | Monitoreo V1 (overview + feed Claro + feed competencia) | rutas `/app/monitor/overview`, `/app/monitor/feed-claro` y `/app/monitor/feed-competencia` operativas con separacion por `scope` y feed limitado a 2 noticias por query
- CLARO-044 | done | P1 | CI/CD frontend en AWS Amplify via GitHub Actions | Amplify `main` configurado con variables `VITE_*`, rewrite SPA `200`, callbacks Cognito actualizados para dominio Amplify y verificacion real de `/` + `/login` en `200`
- CLARO-031 | done | P1 | Configuracion V1 social/news (8 pantallas) | rutas `/app/config/*` desplegadas sin stubs criticos y consumo de backend real validado con contract/smoke en AWS
- CLARO-037 | done | P1 | Integracion Hootsuite/Awario/News a 15m | endpoints `/v1/connectors*` desplegados en runtime, sync manual/runs operativos y validados en `contract:test` + smoke business
- CLARO-038 | done | P1 | Catalogos administrables por Admin | CRUD de cuentas, competidores y taxonomias desplegado (`/v1/config/accounts|competitors|taxonomies/*`) con validacion de `201/409`
- CLARO-039 | done | P1 | Gobernanza de datos y exportes | `/v1/config/audit` y `/v1/config/audit/export` operativos con export CSV sanitizado por rol y permisos S3/KMS ajustados en IAM
- CLARO-023 | done | P1 | Dashboard Overview Salud de Marca | `/v1/monitor/overview` operativo (news-only 7d) y UI de `/app/monitor/overview` conectada a KPIs reales (`BHS`, `SOV`, `sentimiento_neto`, `riesgo_activo`, `severidad`)
- CLARO-033 | done | P1 | Motor de KPIs BHS/SOV severidad | formulas `kpi-v1` implementadas en backend (BHS 50/25/25, SOV 60/40 calidad-volumen, severidad `SEV1..SEV4`) con contract/smoke en verde
- CLARO-036 | done | P1 | Alertas e Incidentes | backend+frontend+infra desplegados: `/v1/monitor/incidents*`, worker programado 15m (EventBridge->SQS->Lambda), ruta `/app/monitor/incidents`, redirect `/app/config/alerts`, auditoria y SLA visible
- CLARO-034 | done | P1 | Modulo Analisis (3 paginas) | backend `GET /v1/analyze/*` + rutas `/app/analyze/overview|channel|competitors` con drill-down funcional y validacion contract/smoke en runtime AWS
- CLARO-035 | done | P1 | Modulo Reportes (3 paginas) | backend `/v1/reports/*` desplegado (templates/schedules/runs/center), worker+scheduler (SQS/EventBridge/Lambda), estado `pending_review` por confianza, pages `/app/reports/*` operativas y flow validado en `contract:test` + smoke business
