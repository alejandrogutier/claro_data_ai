# AGENTS

## Objetivo
Definir el sistema de agentes operativos de `claro_data` para ingesta, clasificación, análisis y gobierno del ciclo de vida de contenido, sobre una arquitectura AWS serverless en `us-west-2`.

## Principios Operativos
- Toda ejecución debe ser trazable (request_id, run_id, actor, timestamp).
- Toda acción crítica debe quedar auditada (`before`/`after`).
- Todos los recursos AWS deben incluir tags obligatorios: `claro=true`, `app=claro-data`, `env=prod`, `owner`, `cost-center`, `managed-by=terraform`.
- Idempotencia obligatoria en jobs asíncronos y reprocesos.
- Seguridad por defecto: secretos en Secrets Manager, cifrado con KMS, least privilege en IAM.

## Flujo Git y Despliegue AWS
- El desarrollo funcional y técnico se realiza en la rama `developer`.
- La rama `main` es la rama productiva conectada a AWS.
- Solo cambios validados deben promoverse de `developer` hacia `main`.
- No se debe desarrollar directamente en `main`.

## Roles de Usuario y Permisos
- `Admin`: administra términos, pesos de fuente, estados, usuarios e infraestructura operativa.
- `Analyst`: clasifica, analiza, archiva/oculta/restaura, exporta, consulta dashboards.
- `Viewer`: solo lectura de vistas autorizadas.

## Agentes del Sistema

### 1) IngestionOrchestrator
**Responsabilidad**
- Orquestar corridas de ingesta programadas (cada 15 minutos) y manuales por término.

**Input**
- `run_id`, `trigger_type` (`scheduled|manual`), `tracked_term_id[]`, `language`, `max_articles_per_term`.

**Output**
- Registro de corrida con métricas de éxito/falla por proveedor, latencia total y conteo de items persistidos.

**Dependencias AWS**
- EventBridge, Step Functions, SQS + DLQ, CloudWatch Logs/X-Ray, Secrets Manager.

**Timeout y Retries**
- Timeout por corrida: 5 minutos.
- Retry exponencial para fallas transitorias de proveedor (`429/5xx`) con backoff y jitter.

**Idempotencia**
- Clave `idempotency_key` por `provider + term + canonical_url + published_at`.

**Errores**
- `partial_failure`: cuando uno o mas proveedores fallan y la corrida continua (`fail-soft`).
- `hard_failure`: cuando falla la orquestacion o persistencia central.

**SLA**
- Ingesta completa disponible en DB <= 5 minutos.

---

### 2) ProviderAdapter
**Responsabilidad**
- Conectar con cada API externa, normalizar payloads y aplicar deduplicacion.

**Input**
- `provider`, `term`, `language`, `window`, `limit`.

**Output**
- `content_item[]` normalizado (`source_type=news` por V1).

**Dependencias AWS**
- Lambda, Secrets Manager, S3 raw payload bucket, CloudWatch.

**Timeout y Retries**
- Timeout por proveedor: 20s.
- Hasta 3 reintentos en errores transitorios.

**Idempotencia**
- Dedupe por URL canonica (sin query/hash).

**Errores**
- Rate limit, auth failure, schema mismatch, timeout.

---

### 3) Classifier
**Responsabilidad**
- Clasificar contenido con Bedrock (`Claude Haiku 4.5`) y persistir resultados.

**Input**
- `content_item_id[]`, `prompt_version`, `model_id`, `classification_profile`.

**Output**
- `classification[]` con sentimiento, categoria, etiquetas, confianza y metadatos del modelo.

**Dependencias AWS**
- Bedrock Runtime, Lambda workers, SQS, Aurora PostgreSQL, CloudWatch/X-Ray.

**Timeout y Retries**
- Timeout por lote: 10 minutos (hasta 100 articulos).
- Retry selectivo por timeout/model throttling.

**Idempotencia**
- `classification_hash = content_item_id + prompt_version + model_id`.

**Errores**
- `model_timeout`, `throttling`, `invalid_json`, `storage_error`.

**SLA**
- Lote de 100 articulos clasificado <= 10 minutos.

---

### 4) Analyzer
**Responsabilidad**
- Generar analisis agregado (narrativas, riesgos, oportunidades) por termino o conjunto de insights.

**Input**
- `analysis_run_id`, `term|content_ids`, `analysis_prompt_version`, `model_id`.

**Output**
- Resultado agregado persistido en `analysis_runs`.

**Dependencias AWS**
- Bedrock Runtime, Lambda, Aurora PostgreSQL, S3 exports.

**Timeout y Retries**
- Timeout: 120s por ejecucion.
- Retry 2x en fallas transitorias de Bedrock.

**Idempotencia**
- `analysis_fingerprint = sorted(content_ids) + prompt_version + model_id`.

**Errores**
- `insufficient_input`, `model_failure`, `persistence_failure`.

---

### 5) LifecycleManager
**Responsabilidad**
- Gestionar estados `active|archived|hidden`, restauraciones y acciones masivas.

**Input**
- `actor_user_id`, `content_item_id|content_item_ids[]`, `target_state`, `reason`.

**Output**
- Cambios de estado aplicados + eventos en `content_state_events` y `audit_logs`.

**Dependencias AWS**
- API Lambda, Aurora PostgreSQL, CloudWatch.

**Timeout y Retries**
- Timeout por operacion: 30s.
- Reintentos solo en errores de red/conexion DB.

**Idempotencia**
- `state_transition_key = actor + target_state + item_id + request_id`.

**Errores**
- `forbidden_transition`, `rbac_denied`, `not_found`, `concurrency_conflict`.

---

### 6) DigestExporter
**Responsabilidad**
- Generar digest diario (08:00) y exportaciones CSV bajo permisos.

**Input**
- `digest_date`, `recipient_scope`, `filters`, `requester_role`.

**Output**
- Digest enviado por SES y/o archivo CSV en S3 con referencia auditable.

**Dependencias AWS**
- EventBridge Scheduler, Lambda, SES, S3 exports, Aurora PostgreSQL.

**Timeout y Retries**
- Timeout por ejecucion: 120s.
- Retry 3x para envio SES transitorio.

**Idempotencia**
- `digest_key = digest_date + recipient_scope + env`.

**Errores**
- `email_delivery_failure`, `empty_dataset`, `export_generation_failure`.

## Runbook de Incidentes y Escalamiento

### Severidades
- `SEV-1`: API principal fuera de servicio o perdida de datos activa.
- `SEV-2`: Degradacion severa de ingesta/clasificacion.
- `SEV-3`: fallo parcial con workaround operativo.

### Flujo
1. Detectar incidente en CloudWatch Dashboard/X-Ray.
2. Identificar `request_id`/`run_id` y componente afectado.
3. Activar mitigacion:
   - Pausar scheduler de ingesta si hay tormenta de errores.
   - Drenar/revisar DLQ.
   - Reducir concurrencia de clasificacion si hay throttling/costo elevado.
4. Comunicar estado en canal operativo.
5. Ejecutar postmortem con causa raiz, impacto, acciones correctivas y fecha compromiso.

## Reglas Transversales de Seguridad y Trazabilidad
- No usar secretos en `.env` para produccion.
- No loggear payloads sensibles completos.
- Cifrado KMS en S3, Aurora, SQS, Secrets y logs.
- Auditoria obligatoria para cambios en:
  - estados de contenido,
  - overrides de clasificacion,
  - pesos de fuente,
  - exportaciones.
- Mantener versionado de prompts en repositorio y referencia de version en cada resultado IA.
