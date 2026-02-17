# AGENTS

## Objetivo
Definir el sistema de agentes operativos de `claro_data` para monitorear salud de marca de Claro Colombia en una sola aplicacion, unificando:
- cuentas sociales propias (Hootsuite),
- menciones externas y competencia (Awario),
- noticias (providers news),
sobre AWS serverless en `us-east-1`.

## Objetivos de Negocio V1
- Objetivo dual:
  - Salud de marca: 60%
  - Share of Voice (SOV): 40%
- Meta SOV: `+5 pp trimestral`
- Meta Brand Health Score: `>=70 sostenido`
- SLA respuesta SEV-1: `<=30 min`

## Principios Operativos
- Trazabilidad obligatoria por ejecucion (`request_id`, `run_id`, `actor`, `timestamp`).
- Auditoria obligatoria de acciones criticas (`before`/`after`).
- Idempotencia obligatoria en ingesta, reprocesos y reportes.
- Seguridad por defecto: Secrets Manager + KMS + IAM least privilege.
- Normalizacion y dedupe cross-source para evitar duplicidad funcional.
- Gestion de ruido (spam/bots) obligatoria antes de KPIs oficiales.

## Flujo Git y Despliegue AWS
- Desarrollo en rama `developer`.
- `main` conectada a produccion AWS.
- Solo cambios validados se promueven de `developer` a `main`.
- No desarrollar directo en `main`.

## Roles de Usuario y Permisos
- `Admin`: configura conectores, cuentas, competidores, queries, taxonomias, alertas, plantillas y destinatarios.
- `Analyst`: monitorea, analiza, gestiona incidentes, hace overrides semanticos auditados.
- `Viewer`: solo lectura de vistas autorizadas.

## Agentes del Sistema

### 1) ConnectorSyncOrchestrator
**Responsabilidad**
- Orquestar sincronizacion de Hootsuite, Awario y News en modo pull.

**Input**
- `run_id`, `trigger_type` (`scheduled|manual`), `connector`, `window`, `limit`.

**Output**
- Corrida registrada con metricas por conector: latencia, fetched, persisted, errores.

**Dependencias AWS**
- EventBridge, Step Functions, SQS + DLQ, CloudWatch, Secrets Manager.

**Timeout y Retries**
- Timeout por corrida: 5 min.
- Retry exponencial para `429/5xx` con jitter.

**Idempotencia**
- `idempotency_key = connector + external_id + published_at`.

**SLA**
- Frescura de datos objetivo: `<=15 min`.

---

### 2) SourceNormalizerDeduper
**Responsabilidad**
- Normalizar payloads heterogeneos a esquema canonico y deduplicar cross-source.

**Input**
- `connector`, `raw_item`, `source_post_id|url|hash`.

**Output**
- `content_item` canonico con trazabilidad de origenes.

**Reglas**
- ID canonico primario: `source_post_id`.
- Fallback: URL/hash normalizado.
- Mantener linkage de origen multiple cuando se unifica.

**Errores**
- `schema_mismatch`, `missing_identity`, `invalid_timestamp`, `duplicate_conflict`.

---

### 3) Classifier
**Responsabilidad**
- Clasificar contenido con Bedrock (`Claude Haiku 4.5`) en taxonomia transversal social+news.

**Input**
- `content_item_id[]`, `prompt_version`, `model_id`, `classification_profile`.

**Output**
- `classification[]` con `sentimiento`, `categoria`, `etiquetas`, `confianza`.

**Dependencias AWS**
- Bedrock Runtime, Lambda workers, SQS, Aurora PostgreSQL, CloudWatch/X-Ray.

**Timeout y Retries**
- Timeout por lote: 10 min (hasta 100 items).
- Retry selectivo por timeout/throttling.

**Idempotencia**
- `classification_hash = content_item_id + prompt_version + model_id`.

**Errores**
- `model_timeout`, `throttling`, `invalid_json`, `storage_error`.

---

### 4) KpiEngine
**Responsabilidad**
- Calcular KPIs oficiales de marca y competencia para dashboard/reportes.

**KPIs oficiales V1**
- `BHS` (Brand Health Score)
- `SOV` (Share of Voice)
- `sentimiento_neto`
- `riesgo_activo`

**Formulas base**
- `BHS`: reputacion 50% + alcance 25% + riesgo 25%.
- Peso por fuente global: social 50%, awario 30%, news 20%.
- `SOV` ponderado por mencion: calidad 60% + alcance 40%.
- SOV se calcula sobre Claro + set cerrado de competidores.

**Severidad**
- `SEV-1 >= 80`, `SEV-2 >= 60`, `SEV-3 < 60`.

---

### 5) Analyzer
**Responsabilidad**
- Generar analisis agregado (narrativas, riesgos, oportunidades) por marca/canal/competencia.

**Input**
- `analysis_run_id`, `scope` (`overview|channel|competitor`), `content_ids|filters`, `prompt_version`, `model_id`.

**Output**
- Resultado agregado persistido en `analysis_runs`.

**Dependencias AWS**
- Bedrock Runtime, Lambda, Aurora PostgreSQL, S3 exports.

**Timeout y Retries**
- Timeout: 120s por ejecucion.
- Retry 2x en fallas transitorias de Bedrock.

**Idempotencia**
- `analysis_fingerprint = sorted(content_ids) + prompt_version + model_id`.

---

### 6) IncidentManager
**Responsabilidad**
- Operar alertas, triage y seguimiento basico de incidentes reputacionales.

**Input**
- `incident_id`, `severity_score`, `owner`, `state`, `notes`, `request_id`.

**Output**
- Incidente actualizado con historico auditado.

**Reglas V1**
- Notificacion por `in-app + email`.
- Cooldown de alertas repetidas: 60 min.
- Asignacion manual asistida por reglas.
- Sin integracion externa de tickets en V1.

---

### 7) ReportingComposer
**Responsabilidad**
- Generar reportes ejecutivos y operativos automaticos.

**Input**
- `report_type` (`executive|operational`), `schedule`, `recipient_scope`, `filters`, `template_version`.

**Output**
- Reporte `Web + CSV` con versionado y trazabilidad.

**Narrativa IA**
- Modo automatico con disclaimer y trazabilidad de fuentes.
- Umbral minimo de envio: `confianza >= 0.65`.
- Si `< 0.65`, queda `pending_review`.

**Schedules default**
- Diario 08:00
- Semanal lunes 08:00
- Mensual dia 1 08:00

---

### 8) LifecycleManager
**Responsabilidad**
- Gestionar estado de contenido (`active|archived|hidden`) y acciones masivas.

**Input**
- `actor_user_id`, `content_item_id|content_item_ids[]`, `target_state`, `reason`.

**Output**
- Cambios aplicados + `content_state_events` + `audit_logs`.

**Reglas V1**
- Motivo obligatorio al pasar a `archived|hidden`.
- Restauracion a `active` con motivo opcional.

---

### 9) ConfigGovernanceManager
**Responsabilidad**
- Administrar configuraciones maestras y su auditoria.

**Scope**
- Conectores
- Cuentas propias
- Competidores
- Queries versionadas
- Taxonomias
- Reglas de alerta
- Plantillas/destinatarios de reportes

**Regla de acceso**
- Edicion directa solo por `Admin`.

**Auditoria**
- Registrar `before/after`, `actor`, `request_id`, `timestamp`.

## Runbook de Incidentes y Escalamiento

### Severidades
- `SEV-1`: score >=80 o impacto reputacional critico.
- `SEV-2`: score 60-79 con degradacion severa.
- `SEV-3`: score <60 con workaround operativo.

### Flujo
1. Detectar evento en dashboard operativo o alerta.
2. Identificar `request_id`/`run_id` y entidades afectadas.
3. Ejecutar mitigacion:
   - ajustar reglas/queries si hay tormenta de ruido,
   - revisar conectores con errores,
   - activar owner de incidente.
4. Comunicar estado operativo.
5. Cerrar con postmortem y acciones correctivas.

## Reglas Transversales de Seguridad y Trazabilidad
- No usar secretos productivos en `.env`.
- No loggear payloads sensibles completos.
- Cifrado KMS en S3, Aurora, SQS, Secrets y logs.
- PII minimizada/enmascarada por defecto.
- Exportes CSV sanitizados por defecto.
- Export de PII completa: solo `Admin` y auditable.
- Retencion activa objetivo: 24 meses.

## Criterios de Go-live
1. 16 cuentas propias activas y validadas.
2. Set final de competidores aprobado para SOV.
3. KPIs oficiales estables (`BHS`, `SOV`, sentimiento neto, riesgo activo).
4. Reportes automaticos operativos (`Web + CSV`).
5. UAT 2 semanas + piloto 1 semana completados.
