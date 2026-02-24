# APIs Reference and Integration Playbook (Social Mind AI)

Last updated: 2026-02-16

This document summarizes all APIs used in this repository, how each connection is implemented, what data is extracted, and which implementation patterns are reusable as best practices.

## 1) Runtime Modes and API Surfaces

This repo has two backend execution modes:

- `Vercel Serverless (Node.js + Postgres)`
- `Local Docker (FastAPI + SQLite)`

Both modes implement the same business flow:

`News ingestion -> article normalization/dedup -> AI classification -> aggregated analysis -> history/archive`

### Host-native vs Containerized

- Host-native services:
- Vercel Serverless runtime (`/api/*`) in production/preview.
- Local shell scripts and CLI flows (`run_all.sh`, `vercel` CLI).

- Containerized services:
- `news_service` on `http://localhost:19081`
- `insights_service` on `http://localhost:19090`
- `analysis_service` on `http://localhost:19100`

## 2) External APIs Used

## 2.1 OpenAI Chat Completions

- Base URL (env):
- `OPENAI_API_URL` (default: `https://api.openai.com/v1/chat/completions`)
- Auth:
- `Authorization: Bearer <OPENAI_API_KEY>`
- Method:
- `POST`
- Body pattern:

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.2,
  "response_format": { "type": "json_object" }
}
```

- Response handling:
- `choices[0].message.content`
- JSON is parsed defensively by slicing first `{` and last `}`.

- Timeouts:
- Serverless Node: `OPENAI_TIMEOUT` in milliseconds (default `60000`).
- `insights_service` Python: seconds (default `120`).
- `analysis_service` Python: seconds (default `180`).

## 2.2 News Providers

All providers are called via `GET` and normalized to the same article schema.

Normalized schema:

```json
{
  "source": { "id": "...", "name": "..." },
  "author": "...",
  "title": "...",
  "description": "...",
  "url": "...",
  "urlToImage": "...",
  "publishedAt": "...",
  "content": "...",
  "category": "..."
}
```

### NewsAPI

- URL env:
- `NEWS_API_URL` (default `https://newsapi.org/v2/everything`)
- Auth:
- Node: header `X-Api-Key`
- Python: query `apiKey` + headers `X-Api-Key` and `Authorization`
- Query params:
- `q`, `pageSize`, `sortBy`, `language` (optional)
- Extracted fields:
- Native fields already match most normalized keys.

### GNews

- URL env:
- `GNEWS_API_URL` (default `https://gnews.io/api/v4/search`)
- Auth:
- Node: query `token`
- Python: query `apikey` + header `X-Api-Key`
- Query params:
- `q`, `lang`, `max`
- Extracted fields:
- `image` -> `urlToImage`
- Standard `source/title/description/url/publishedAt/content`

### NewsData.io

- URL env:
- `NEWSDATA_API_URL` (default `https://newsdata.io/api/1/latest`)
- Auth:
- query `apikey`
- Python also sends header `X-ACCESS-KEY`
- Query params:
- `q`, `size`, `language` (optional)
- Extracted mapping:
- `results[].link` -> `url`
- `results[].image_url` -> `urlToImage`
- `results[].pubDate` -> `publishedAt`
- `results[].source_id/source_name` -> `source`
- `results[].creator[]` -> `author` CSV in Python path

### World News API

- URL env:
- `WORLDNEWS_API_URL` (default `https://api.worldnewsapi.com/search-news`)
- Auth:
- query `api-key`
- Python also sends header `x-api-key`
- Query params:
- `text`, `number`, `language` (optional)
- Extracted mapping:
- `news[].summary` -> `description`
- `news[].text` (fallback `summary`) -> `content`
- `news[].publish_date` -> `publishedAt`
- `news[].image` -> `urlToImage`

### The Guardian Content API

- URL env:
- `GUARDIAN_API_URL` (default `https://content.guardianapis.com/search`)
- Auth:
- query `api-key`
- Query params:
- `q`, `page-size`, `order-by=newest`, `show-fields=...`
- Node fields requested:
- `trailText,thumbnail,body`
- Python fields requested:
- `trailText,thumbnail,byline`
- Extracted mapping:
- `webTitle` -> `title`
- `webUrl` -> `url`
- `webPublicationDate` -> `publishedAt`
- `sectionName` -> `category`

### NYT Article Search API

- URL env:
- `NYT_API_URL` (default `https://api.nytimes.com/svc/search/v2/articlesearch.json`)
- Auth:
- query `api-key`
- Query params:
- Node: `q`
- Python: `q`, `sort=newest`, `page=0`, optional `fq=language.code:("xx")`
- Extracted mapping:
- `headline.main` -> `title`
- `web_url` -> `url`
- `pub_date` -> `publishedAt`
- `snippet/abstract/lead_paragraph` -> `description/content`
- `multimedia` normalized into absolute `urlToImage`

## 3) Internal API Catalog (Serverless, `/api/*`)

Base URL examples:

- Local Vercel dev: `http://localhost:3000/api`
- Production: `https://<your-domain>/api`

All handlers enforce HTTP method checks and return `405` on mismatch.

## 3.1 News and Archive

### `GET /api/news`

- Query:
- `term` (required)
- `language` (optional)
- Behavior:
- Fetches all provider sources in parallel.
- Deduplicates by normalized URL.
- Persists into `news_articles`.
- Response `200`:

```json
{
  "term": "ai",
  "total_results": 42,
  "articles": [
    {
      "source": { "id": null, "name": "NewsAPI" },
      "author": "...",
      "title": "...",
      "description": "...",
      "url": "...",
      "urlToImage": "...",
      "publishedAt": "...",
      "content": "...",
      "category": "...",
      "term": "ai",
      "provider": "newsapi"
    }
  ]
}
```

- Errors:
- `400` missing `term`
- `502` provider or downstream error

### `GET /api/news/archive`

- Query:
- `term` optional exact filter
- `limit` max `200`
- `offset`
- `order` `asc|desc` (default `desc`)
- Behavior:
- Reads `news_articles` and excludes rows with `published_at IS NULL`.
- Response `200`:

```json
{
  "total": 120,
  "articles": [
    {
      "id": 1,
      "term": "ai",
      "provider": "newsapi",
      "source": { "id": null, "name": "NewsAPI" },
      "title": "...",
      "url": "...",
      "urlToImage": "...",
      "publishedAt": "...",
      "saved_at": "..."
    }
  ]
}
```

### `GET /api/news/archive/meta`

- Query:
- `limit` max `200`
- Response `200`:

```json
{
  "sources": [{ "value": "NewsAPI", "count": 60 }],
  "categories": [{ "value": "technology", "count": 25 }]
}
```

## 3.2 Insights

### `GET /api/insights`

- Query:
- `term` required
- `language` optional
- Behavior:
- Fetch news -> save articles -> classify with OpenAI -> persist in `insights`.
- Response `200`:

```json
{
  "term": "ai",
  "count": 5,
  "insights": [
    {
      "id": 101,
      "term": "ai",
      "sentimiento": "neutro",
      "resumen": "...",
      "categoria": "tecnologia",
      "etiquetas": "...",
      "marca": "...",
      "entidad": "...",
      "article_title": "...",
      "article_url": "...",
      "created_at": "..."
    }
  ]
}
```

### `POST /api/insights/classify`

- Body (`application/json`):

```json
{
  "term": "ai",
  "language": "en",
  "articles": [
    {
      "title": "...",
      "description": "...",
      "content": "...",
      "url": "...",
      "urlToImage": "..."
    }
  ]
}
```

- Behavior:
- If `articles` is present and non-empty, classify directly.
- If `articles` missing/empty, `term` is required and news is fetched first.
- If classifying direct articles without `term`, term defaults to `custom`.
- Response:
- Same shape as `GET /api/insights`.
- Errors:
- `400` when neither `term` nor `articles` provided

### `GET /api/insights/list`

- Query:
- `term` optional
- `limit` max `200`
- `offset`
- Response `200`:

```json
{
  "total": 300,
  "items": [
    {
      "id": 101,
      "term": "ai",
      "sentimiento": "positivo",
      "resumen": "...",
      "resumen_ejecutivo": "...",
      "tono": "tecnico",
      "created_at": "..."
    }
  ]
}
```

### `GET /api/history`

- Query:
- `limit` max `500`
- Response:
- Array of recent insight rows ordered by `id DESC`.

## 3.3 Analysis

### `POST /api/analysis/run`

- Body (`application/json`):

```json
{
  "term": "ai",
  "limit": 6,
  "insight_ids": [101, 102, 103]
}
```

- Behavior:
- If `insight_ids` provided, analyzes exactly those rows.
- Otherwise takes latest insights by `term` and `limit` (max `20`).
- Calls OpenAI aggregation prompt.
- Persists to `analysis_results`.
- Response `200`:

```json
{
  "analysis_id": 55,
  "term": "ai",
  "count": 6,
  "insights": [],
  "oportunidades_negocio": [],
  "riesgos_reputacionales": [],
  "sintesis_general": "...",
  "narrativa_principal": "...",
  "framing_predominante": "...",
  "temas_dominantes": "...",
  "nivel_tecnico": "intermedio"
}
```

- Errors:
- `404` no insights found
- `502` OpenAI/DB failures

### `GET /api/analysis/history`

- Query:
- `limit` max `100`
- Response:
- Array with stored analyses (summary arrays + enriched analysis fields + `insight_ids`).

## 3.4 Admin and Utilities

### `POST /api/admin/clear-database`

- Auth:
- Header `x-admin-token` or query `token`
- Compares against `ADMIN_TOKEN` env.
- Behavior:
- Deletes `analysis_results`, `insights`, `news_articles`.
- Resets sequences.
- Response `200`:

```json
{
  "success": true,
  "message": "All tables cleared successfully",
  "tables_cleared": ["news_articles", "insights", "analysis_results"],
  "timestamp": "2026-02-16T00:00:00.000Z"
}
```

### `GET /api/proxy-image`

- Query:
- `url` required
- Method support:
- `GET`
- `OPTIONS` (CORS preflight)
- Behavior:
- Attempts direct fetch and fallback mirrors (`wsrv.nl`, `images.weserv.nl`).
- Returns upstream binary with image content-type.
- If all fails, returns 1x1 transparent PNG fallback.

## 3.5 Route Notes

- `vercel.json` maps `/api/(.*)` to `/api/$1.js`.
- There are duplicated insight handlers:
- `api/insights.js`
- `api/insights/index.js`
- Main path `/api/insights` resolves to `api/insights.js` with current routing.

## 4) Internal API Catalog (Local FastAPI Services)

These are used mainly in Docker local mode.

## 4.1 `news_service` (`:19081`)

### `GET /health`

- Response:

```json
{ "status": "ok" }
```

### `GET /news`

- Query:
- `term` required
- `advanced` optional (replaces term in provider query)
- `language` optional 2-letter ISO code
- Behavior:
- Calls all providers.
- Deduplicates and sorts by publication date.
- Persists in SQLite `news_archive`.
- Response shape:
- `{ term, total_results, articles[] }`

### `GET /news/archive`

- Query:
- `term` optional full-text LIKE filter over title/description/content
- `source` optional exact
- `category` optional exact
- `order` `asc|desc`
- `limit` `1..200`
- `offset` `>=0`
- Response:
- `{ total, articles[] }`

### `GET /news/archive/meta`

- Query:
- `limit` `1..200`
- Response:
- `{ sources: [{value,count}], categories: [{value,count}] }`

## 4.2 `insights_service` (`:19090`)

### `GET /health`

- Response:

```json
{ "status": "ok", "db_path": "/data/insights.db" }
```

### `GET /insights`

- Query:
- `term` required
- `language` optional
- Behavior:
- Pulls articles from `news_service` and classifies with OpenAI.
- Persists in SQLite `insights`.

### `POST /insights/classify`

- Body:

```json
{
  "term": "ai",
  "language": "en",
  "articles": [
    { "title": "...", "description": "...", "content": "...", "url": "..." }
  ]
}
```

- Behavior:
- Same logic as serverless classify endpoint.

### `GET /insights/list`

- Query:
- `term` optional
- `limit` `1..200`
- `offset` `>=0`
- Response:
- `{ total, items[] }`

### `GET /history`

- Query:
- `limit` `1..500`
- Response:
- `items[]` (latest insights)

## 4.3 `analysis_service` (`:19100`)

### `GET /health`

- Response:

```json
{ "status": "ok", "db_path": "/data/insights.db" }
```

### `GET /analysis`

- Query:
- `term` optional
- `limit` `2..ANALYSIS_MAX_LIMIT`
- Behavior:
- Reads insights from SQLite.
- Calls OpenAI for aggregation.
- Returns non-persistent analysis.

### `POST /analysis/run`

- Body:

```json
{
  "term": "ai",
  "limit": 10,
  "insight_ids": [1, 2, 3]
}
```

- Behavior:
- Runs aggregation and persists in `analysis_results`.
- Returns `analysis_id`.

### `GET /analysis/history`

- Query:
- `limit` `1..100`
- Response:
- Stored analyses list.

## 5) Data Extracted and Persisted

## 5.1 News-level fields (provider extraction)

- `source.id`
- `source.name`
- `author`
- `title`
- `description`
- `url`
- `urlToImage`
- `publishedAt`
- `content`
- `category`

## 5.2 Insight-level fields (LLM classification)

Core fields:

- `sentimiento`
- `resumen`
- `categoria`
- `etiquetas`
- `marca`
- `entidad`

Enriched fields:

- `resumen_ejecutivo`
- `idioma`
- `confianza`
- `relevancia`
- `accion_recomendada`
- `cita_clave`
- `tono`
- `temas_principales`
- `subtemas`
- `stakeholders`
- `impacto_social`
- `impacto_economico`
- `impacto_politico`
- `palabras_clave_contextuales`
- `trending_topics`
- `analisis_competitivo`
- `credibilidad_fuente`
- `sesgo_detectado`
- `localizacion_geografica`
- `fuentes_citadas`
- `datos_numericos`
- `urgencia`
- `audiencia_objetivo`

Article metadata copied into insight row:

- `article_title`
- `article_description`
- `article_content`
- `article_url`
- `article_image`

## 5.3 Analysis-level fields (LLM aggregation)

Output arrays:

- `insights`
- `oportunidades_negocio`
- `riesgos_reputacionales`

Enriched narrative fields include:

- `sintesis_general`
- `narrativa_principal`
- `narrativas_alternativas`
- `framing_predominante`
- `linea_temporal`
- `contexto_necesario`
- `actores_principales`
- `voces_presentes`
- `voces_ausentes`
- `posiciones_enfrentadas`
- `puntos_de_consenso`
- `puntos_de_conflicto`
- `datos_clave`
- `fuentes_primarias`
- `citas_destacadas`
- `tono_general_cobertura`
- `equilibrio_cobertura`
- `calidad_periodistica`
- `nivel_credibilidad`
- `consistencia_hechos`
- `verificacion_necesaria`
- `sesgos_identificados`
- `lenguaje_cargado`
- `epicentro_geografico`
- `alcance_geografico`
- `zonas_afectadas`
- `temas_dominantes`
- `temas_emergentes`
- `palabras_clave_frecuentes`
- `hashtags_tendencia`
- `impacto_social_proyectado`
- `impacto_politico_proyectado`
- `impacto_economico_proyectado`
- `escenarios_posibles`
- `eventos_por_vigilar`
- `aspectos_ignorados`
- `audiencia_objetivo_agregada`
- `nivel_tecnico`

## 6) Connection Methods and Infrastructure Details

## 6.1 HTTP client patterns

- Node serverless:
- Native `fetch`.
- `AbortController` timeout wrappers for both providers and OpenAI.

- Python services:
- `requests` library.
- Explicit timeout per call.
- Raises `HTTPException` with translated downstream error context.

## 6.2 Database patterns

- Serverless (Postgres via `pg`):
- Connection string fallback order:
- `POSTGRES_URL` -> `POSTGRES_PRISMA_URL` -> `DATABASE_URL` -> `POSTGRES_URL_NON_POOLING` -> `DATABASE_URL_UNPOOLED`
- Pool size: `max: 5`
- SSL: `{ rejectUnauthorized: false }`
- Idempotent schema bootstrap on first query (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS`).

- Local services (SQLite):
- `news_service` stores archive in `NEWS_DB_PATH`.
- `insights_service` and `analysis_service` share `INSIGHTS_DB_PATH`.
- Uses incremental migration pattern with `PRAGMA table_info` + `ALTER TABLE`.

## 6.3 Service-to-service calls

- `insights_service` -> `news_service` via `NEWS_SERVICE_URL` (Docker DNS default `http://news_service:8080`).
- Serverless mode keeps logic in shared `serverless_lib` and does not call FastAPI services.

## 7) End-to-End Call Structures

## 7.1 Fetch news only

1. Client calls `GET /api/news?term=...`.
2. Backend fans out to external providers in parallel.
3. Normalizes and deduplicates.
4. Persists into `news_articles`.
5. Returns merged article list.

## 7.2 Classify with automatic fetch

1. Client calls `POST /api/insights/classify` with `term`.
2. Backend fetches and stores news.
3. Iterates over up to `MAX_ARTICLES` items.
4. Sends one OpenAI call per article.
5. Persists each insight row.
6. Returns `{ term, count, insights[] }`.

## 7.3 Classify provided articles

1. Client calls `POST /api/insights/classify` with `articles[]`.
2. Backend skips provider fetch.
3. Direct OpenAI classification + persistence.
4. If `term` omitted, term=`custom`.

## 7.4 Run analysis

1. Client calls `POST /api/analysis/run` with either `insight_ids` or (`term`+`limit`).
2. Backend loads target insights.
3. Builds aggregated JSON prompt and calls OpenAI once.
4. Persists analysis record.
5. Returns analysis payload with `analysis_id`.

## 8) cURL Examples (Reusable)

### 8.1 Serverless endpoints

```bash
curl -s "http://localhost:3000/api/news?term=artificial%20intelligence&language=en"
```

```bash
curl -s -X POST "http://localhost:3000/api/insights/classify" \
  -H "Content-Type: application/json" \
  -d '{"term":"artificial intelligence","language":"en"}'
```

```bash
curl -s -X POST "http://localhost:3000/api/analysis/run" \
  -H "Content-Type: application/json" \
  -d '{"term":"artificial intelligence","limit":6}'
```

```bash
curl -s "http://localhost:3000/api/insights/list?term=artificial%20intelligence&limit=20&offset=0"
```

```bash
curl -s "http://localhost:3000/api/analysis/history?limit=20"
```

```bash
curl -s -X POST "http://localhost:3000/api/admin/clear-database" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### 8.2 Docker local services

```bash
curl -s "http://localhost:19081/news?term=artificial%20intelligence&language=en"
```

```bash
curl -s "http://localhost:19090/insights?term=artificial%20intelligence"
```

```bash
curl -s -X POST "http://localhost:19100/analysis/run" \
  -H "Content-Type: application/json" \
  -d '{"term":"artificial intelligence","limit":6}'
```

## 9) Best Practices You Can Reuse in Another Project

## 9.1 Practices already implemented well

- Enforce method contract early (`405` immediately).
- Validate required params with clear `400` errors.
- Cap pagination and processing limits to safe maxima.
- Normalize upstream payloads into one internal schema.
- Deduplicate by canonical URL (remove query/hash).
- Use fail-soft provider fan-out (one source failure does not kill whole response).
- Force structured LLM outputs with `response_format=json_object`.
- Parse LLM JSON defensively.
- Persist enriched outputs for reproducibility and history APIs.
- Keep schema migration idempotent in app startup/query path.

## 9.2 Improvements recommended before porting

- Remove insecure fallback `ADMIN_TOKEN='change-me-in-production'`; require env in all environments.
- Add retry policy with exponential backoff for transient `429/5xx` provider errors.
- Add per-provider metrics (latency, success rate, quota usage).
- Add explicit request IDs and structured logs for traceability.
- Add authentication/authorization for non-public endpoints beyond admin clear.
- Add contract tests for each endpoint and provider adapter.
- Align model/timeouts defaults across Node and Python paths to reduce drift.
- Consider queue/batch strategy for OpenAI classification to control cost and latency.

## 10) Portability Checklist for New Development

- Copy normalized article schema and keep provider adapters isolated.
- Keep env-driven endpoints, keys, and model configuration.
- Keep hard limits on `limit`, `offset`, and `MAX_ARTICLES`.
- Keep history endpoints for auditability.
- Keep archive meta endpoints (`sources`, `categories`) for UX filters.
- Keep strict JSON LLM contract and schema evolution strategy.
- Keep defensive parsing and typed response models.

## 11) Known Behavioral Differences Between Modes

- Serverless uses Postgres; local uses SQLite.
- FastAPI `/news/archive` supports full-text LIKE search over article text; serverless `/api/news/archive` currently filters exact `term`.
- OpenAI default model differs by code path (`gpt-4o-mini` in libs vs `gpt-4.1` in some compose defaults).
- Serverless `saveArticles` currently tags persisted provider as `newsapi` in endpoint calls, even when merged from multiple sources.

---

## Actualización 2026-02-20: Integración Awario Comments (V1)

### Endpoints nuevos

#### Monitor Social
- `GET /v1/monitor/social/posts`
  - Ahora incluye `awario_comments_count` por post.
- `GET /v1/monitor/social/posts/{post_id}/comments`
  - Paginación (`limit`, `cursor`) y filtros (`sentiment`, `is_spam`, `related_to_post_text`).
- `PATCH /v1/monitor/social/comments/{comment_id}`
  - Override manual de flags/sentimiento con auditoría.

#### Configuración
- `GET /v1/config/awario/profiles`
- `POST /v1/config/awario/profiles`
- `PATCH /v1/config/awario/profiles/{id}`
- `GET /v1/config/awario/bindings`
- `POST /v1/config/awario/bindings`
- `PATCH /v1/config/awario/bindings/{id}`

### Modelo de datos nuevo
- `SocialPostComment`
  - Comentario Awario ya vinculado a `SocialPostMetric`.
  - Llave canónica de match: `channel + parentExternalPostId`.
  - Dedupe por `awarioMentionId`.
- `SocialPostCommentOverride`
  - Auditoría de cambios manuales (before/after, actor, requestId, reason).
- `AwarioQueryProfile`
  - Definición interna de query en plataforma.
- `AwarioAlertBinding`
  - Mapeo interno profile -> `awario_alert_id` externo + estado de validación.

### Consideraciones de operación
- Alcance V1: solo persistir comentarios vinculables a posts existentes.
- Comentarios no vinculables se contabilizan en métricas de corrida (`skipped_unlinked`).
- La creación/edición de alertas sigue siendo manual en Awario; la plataforma gestiona profiles/bindings internos.
