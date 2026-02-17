# UX Planning - claro_data V1 (Social + News + Competencia)

## 1) Metadata
- Fecha: 2026-02-17
- Version: v3.0
- Estado: especificacion funcional UX/UI para implementacion
- Region tecnica objetivo: us-east-1
- Zona horaria operativa default: America/Bogota
- Idioma base de interfaz y reportes: espanol

## 2) Proposito del documento
Este documento define la logica completa de experiencia de usuario para V1, de forma que front y back puedan implementarse sin decisiones ambiguas.

Incluye:
- alcance funcional y no funcional,
- arquitectura de pantallas,
- reglas de negocio y KPIs,
- contratos esperados UI/API,
- estados de interfaz,
- criterios de aceptacion,
- plan de release.

## 2.1) Relacion ejecutable con BACKLOG.md
Este documento y `BACKLOG.md` se ejecutan en conjunto. Cada historia de front debe mapearse a una o mas secciones de UX para evitar desarrollo sin contexto.

### Matriz Backlog -> UX (fuente de arranque)
| Historia | Objetivo | Secciones UX obligatorias |
|---|---|---|
| CLARO-022 | Shell FE, auth, routing, RBAC | 6, 7, 20 |
| CLARO-023 | Overview Salud de Marca | 9.1, 12 |
| CLARO-031 | Pantallas de Configuracion (8) | 8 |
| CLARO-032 | Monitoreo (feeds + triage) | 9 |
| CLARO-033 | Motor KPI (`BHS/SOV/severidad`) | 12 |
| CLARO-034 | Modulo Analisis (3 paginas) | 10 |
| CLARO-035 | Modulo Reportes (3 paginas) | 11, 16 |
| CLARO-036 | Alertas e Incidentes | 9.4, 12.4 |
| CLARO-037 | Integracion conectores + dedupe | 4, 8.1, 14 |
| CLARO-038 | Catalogos Admin | 8.2, 8.3, 8.5 |
| CLARO-039 | Gobernanza de datos/exportes | 17 |
| CLARO-040 | Calidad semantica | 13 |
| CLARO-041 | Adopcion UX | 18, 26 |
| CLARO-042 | Go-live readiness | 23, 24, 27 |

### Regla de trazabilidad para implementacion
1. Cada PR de front debe declarar al menos una historia `CLARO-xxx`.
2. Cada PR debe citar explicitamente las secciones UX impactadas (ejemplo: `UX 9.2`, `UX 12.2`).
3. Si una historia cambia comportamiento UX, este documento debe actualizarse en el mismo PR.

## 2.2) Mapa inverso UX -> Backlog
Esta vista evita que una seccion UX quede "huerfana" sin historia ejecutable.

| Seccion UX | Alcance | Historias backlog obligatorias |
|---|---|---|
| 8 | Configuracion (8 pantallas) | CLARO-031, CLARO-037, CLARO-038, CLARO-039 |
| 9 | Monitoreo (overview, feeds, incidentes) | CLARO-023, CLARO-032, CLARO-033, CLARO-036, CLARO-040 |
| 10 | Analisis (3 paginas) | CLARO-034, CLARO-033 |
| 11 | Reportes (3 paginas) | CLARO-035, CLARO-039, CLARO-042 |
| 12 | KPI y formulas oficiales | CLARO-023, CLARO-033, CLARO-036 |
| 13 | Calidad de senal | CLARO-040, CLARO-032 |
| 16 | Narrativa IA y gobernanza | CLARO-035, CLARO-039 |
| 18 | Observabilidad UX/producto | CLARO-022, CLARO-032, CLARO-041 |
| 23-24 | Go-live y dependencias | CLARO-042, CLARO-037, CLARO-038 |
| 26-27 | DoR/DoD y secuencia de arranque | CLARO-022, CLARO-031, CLARO-042 |

## 2.3) Unidad minima de desarrollo Front (UMDF)
Toda entrega de front debe definirse como una UMDF. Una UMDF conecta backlog y UX en una pieza implementable.

Campos obligatorios por UMDF:
1. Historia `CLARO-xxx` (fuente: `BACKLOG.md`).
2. Pantalla/ruta impactada (fuente: secciones 7, 8, 9, 10, 11).
3. Contrato API o mock pactado (fuente: historias API relacionadas).
4. Estados UI cubiertos (fuente: seccion 19).
5. Eventos de observabilidad a emitir (fuente: seccion 18).
6. Criterio de aceptacion del modulo (fuente: seccion 21).

Regla operativa:
- si falta cualquiera de los 6 campos, la historia no pasa a `doing`.

## 3) Vision de producto
Construir una sola aplicacion para monitorear salud de marca de Claro Colombia integrando:
- cuentas propias sociales (Hootsuite),
- conversacion externa y competitiva (Awario),
- noticias (news providers).

La plataforma debe soportar:
- operacion diaria,
- deteccion temprana de riesgo,
- analisis accionable,
- reportes automatizados.

## 4) Objetivos de negocio y metas

### 4.1 Objetivo dual
- Salud de marca: 60%
- Share of Voice (SOV): 40%

### 4.2 Metas V1
- SOV: +5 pp trimestral
- Brand Health Score (BHS): >=70 sostenido
- SLA respuesta SEV-1: <=30 minutos
- Frescura multifuente: <=15 minutos

## 5) Alcance V1

### 5.1 Incluido
- Configuracion completa (8 pantallas Admin)
- Monitoreo operativo (overview + feed Claro + feed competencia + triage incidentes)
- Analisis (overview marca, canal/plataforma, benchmark competencia)
- Reportes (centro/historial, plantillas, programacion/envios)
- Reportes automaticos en Web + CSV
- Narrativa IA automatica con guardrails

### 5.2 Excluido
- Export PDF
- Integracion paid media
- Integracion CRM
- Integracion full con sistemas externos de ticketing/incidentes

## 6) Personas y permisos

### 6.1 Roles
- Admin: configuracion, gobernanza, auditoria, exportes sensibles
- Analyst: monitoreo, analisis, incidentes, overrides semanticos auditados
- Viewer: lectura autorizada

### 6.2 Matriz de acceso (V1)
- Configurar:
  - Admin: full
  - Analyst: no
  - Viewer: no
- Monitorear:
  - Admin: full
  - Analyst: full
  - Viewer: lectura
- Analizar:
  - Admin: full
  - Analyst: full
  - Viewer: lectura
- Reportar:
  - Admin: full
  - Analyst: generar/consultar segun permiso
  - Viewer: lectura
- Administrar:
  - Admin: full
  - Analyst: no
  - Viewer: no

## 7) Navegacion e informacion

### 7.1 Navegacion principal por flujo
1. Configurar
2. Monitorear
3. Analizar
4. Reportar
5. Administrar

### 7.2 Home por rol
- Analyst: Overview Salud de Marca
- Admin: Config Conectores (o ultimo modulo usado)
- Viewer: Overview Salud de Marca (solo lectura)

### 7.3 Estructura de rutas propuesta
- `/app/config/connectors`
- `/app/config/accounts`
- `/app/config/competitors`
- `/app/config/queries`
- `/app/config/taxonomy`
- `/app/config/alerts`
- `/app/config/report-templates`
- `/app/config/audit`
- `/app/monitor/overview`
- `/app/monitor/feed-claro`
- `/app/monitor/feed-competencia`
- `/app/monitor/incidents`
- `/app/analyze/overview`
- `/app/analyze/channel`
- `/app/analyze/competitors`
- `/app/reports/center`
- `/app/reports/templates`
- `/app/reports/schedules`

### 7.4 Mapa rutas -> historias -> KPI/eventos
| Ruta | Historias principales | KPI/objetivo dominante | Eventos minimos |
|---|---|---|---|
| `/app/config/*` | CLARO-031, CLARO-037, CLARO-038, CLARO-039 | salud de configuracion y readiness | connector_sync_triggered, connector_sync_failed |
| `/app/monitor/overview` | CLARO-023, CLARO-032, CLARO-033 | BHS, SOV, sentimiento_neto, riesgo_activo | kpi_threshold_breached |
| `/app/monitor/feed-claro` | CLARO-032, CLARO-040, CLARO-010 | triage diario marca | false_positive_marked, override_applied |
| `/app/monitor/feed-competencia` | CLARO-032, CLARO-034 | SOV y brecha de sentimiento | kpi_threshold_breached |
| `/app/monitor/incidents` | CLARO-036, CLARO-033 | SLA de respuesta por severidad | incident_created, incident_assigned, incident_resolved |
| `/app/analyze/*` | CLARO-034, CLARO-033 | narrativas, riesgos, oportunidades | kpi_threshold_breached |
| `/app/reports/*` | CLARO-035, CLARO-039, CLARO-042 | cobertura de reportes y gobernanza | report_generated, report_pending_review |

## 8) Definicion de pantallas - Configuracion (8)
Historias asociadas: `CLARO-031`, `CLARO-037`, `CLARO-038`.

### 8.1 Config Conectores
Objetivo:
- visualizar salud y parametros operativos de Hootsuite, Awario y News.
Backlog principal: `CLARO-031`, `CLARO-037`.

Componentes:
- tarjetas por conector (estado, ultima sync, error reciente, latencia p95, volumen)
- toggle de habilitado/pausado
- frecuencia (default 15m)
- boton de sync manual

Acciones:
- pausar/reanudar conector
- sync manual
- editar parametros no sensibles

Reglas:
- credenciales nunca visibles en UI
- secretos solo en Secrets Manager

Estados UI:
- loading inicial
- conector healthy
- conector degraded
- conector failed
- sin datos

### 8.2 Config Cuentas Propias
Objetivo:
- administrar cuentas oficiales de Claro para monitoreo social.
Backlog principal: `CLARO-031`, `CLARO-038`, `CLARO-042`.

Schema cuenta (obligatorio):
- plataforma
- handle
- nombre_cuenta
- linea_negocio
- region_macro
- idioma
- owner_equipo
- estado
- tags_campana opcional

Acciones:
- crear/editar/desactivar cuenta
- marcar cuenta critica

Reglas:
- go-live exige 16 cuentas activas validadas

Estados UI:
- tabla vacia
- tabla con filtros
- error validacion duplicado handle/plataforma

### 8.3 Config Competidores
Objetivo:
- gestionar lista cerrada oficial para SOV.
Backlog principal: `CLARO-031`, `CLARO-038`, `CLARO-042`.

Campos:
- marca_competidora
- aliases/keywords
- prioridad
- estado

Acciones:
- alta/baja/logica
- editar aliases

Reglas:
- set final aprobado obligatorio para go-live

### 8.4 Query Builder Central
Objetivo:
- administrar reglas de captura de menciones/news con versionado.
Backlog principal: `CLARO-031`, `CLARO-037`, `CLARO-040`.

Componentes:
- editor booleano
- validacion sintactica
- preview de match
- historial de versiones
- rollback

Acciones:
- crear version draft
- publicar version activa
- rollback

Reglas:
- todo cambio auditado with before/after

### 8.5 Taxonomias
Objetivo:
- administrar catalogos de negocio y segmentacion.
Backlog principal: `CLARO-031`, `CLARO-038`.

Catalogos V1:
- categorias
- lineas de negocio
- macro-regiones Colombia
- campanas (`campana > iniciativa`)

Reglas:
- editable solo Admin
- impacto inmediato en filtros/reportes

### 8.6 Reglas de Alertas y Severidad
Objetivo:
- configurar sensibilidad de deteccion.
Backlog principal: `CLARO-031`, `CLARO-036`, `CLARO-033`.

Parametros:
- umbrales severidad
- cooldown
- ventanas
- destinatarios por severidad

Defaults V1:
- SEV-1 >=80
- SEV-2 >=60
- cooldown 60m

### 8.7 Plantillas y Destinatarios de Reporte
Objetivo:
- configurar contenido y audiencias de reportes automaticos.
Backlog principal: `CLARO-031`, `CLARO-035`, `CLARO-039`.

Tipos:
- Ejecutivo
- Operativo

Programacion default:
- diario 08:00
- semanal lunes 08:00
- mensual dia 1 08:00

Output:
- Web + CSV

### 8.8 Auditoria de Configuracion
Objetivo:
- trazar todo cambio de configuracion.
Backlog principal: `CLARO-031`, `CLARO-039`.

Campos mostrados:
- entidad
- accion
- actor
- timestamp
- request_id
- before
- after

Acciones:
- filtrar
- buscar
- exportar log (sanitizado)

## 9) Definicion de pantallas - Monitoreo
Historias asociadas: `CLARO-032`, `CLARO-023`, `CLARO-033`, `CLARO-036`.

### 9.1 Overview Salud de Marca
Objetivo:
- lectura ejecutiva-operativa en una sola vista.
Backlog principal: `CLARO-023`, `CLARO-032`, `CLARO-033`.

KPIs header:
- BHS
- SOV
- sentimiento_neto
- riesgo_activo

Widgets:
- tendencia 7d por KPI
- top narrativas
- top riesgos
- top oportunidades
- estado conectores

Acciones:
- drill-down a feed/analisis/incidentes

### 9.2 Feed Principal Claro (Owned/Earned/News)
Objetivo:
- triage diario de conversacion de marca.
Backlog principal: `CLARO-032`, `CLARO-010`, `CLARO-040`.

Filtros:
- origen
- plataforma
- linea negocio
- region
- sentimiento
- categoria
- severidad
- fecha
- campana

Acciones inline:
- cambiar estado (active/archived/hidden)
- priorizar (high/medium/low/none)
- abrir detalle
- marcar falso positivo (reason code)

### 9.3 Feed Competencia
Objetivo:
- seguimiento dedicado de menciones y desempeo competitivo.
Backlog principal: `CLARO-032`, `CLARO-034`.

Diferenciadores:
- marca objetivo (competidor)
- SOV incremental por competidor
- brecha de sentimiento vs Claro

### 9.4 Triage de Incidentes (basico)
Objetivo:
- gestionar respuesta operativa a alertas.
Backlog principal: `CLARO-036`.

Campos:
- severidad
- owner
- estado
- SLA restante
- notas

Acciones:
- asignar owner
- cambiar estado
- agregar nota

Reglas:
- notificaciones in-app + email
- sin integracion externa de tickets en V1

## 10) Definicion de pantallas - Analisis (3)
Historias asociadas: `CLARO-034`, `CLARO-033`.

### 10.1 Analisis Overview Marca
- consolidado de salud de marca
- drivers positivos/negativos
- contexto de variacion vs periodo anterior
Backlog principal: `CLARO-034`, `CLARO-033`.

### 10.2 Analisis por Canal/Plataforma
- sentimiento y engagement por canal
- top formatos/contenidos
- alertas por canal
Backlog principal: `CLARO-034`.

### 10.3 Benchmark Competencia
- SOV total y por marca
- brecha de sentimiento
- comparativo de riesgo por marca
Backlog principal: `CLARO-034`, `CLARO-033`.

## 11) Definicion de pantallas - Reportes (3)
Historias asociadas: `CLARO-035`, `CLARO-039`.

### 11.1 Centro de Reportes / Historial
- listado de ejecuciones
- estado (`queued|running|completed|failed|pending_review`)
- descarga CSV
- vista web
Backlog principal: `CLARO-035`.

### 11.2 Plantillas
- editor secciones
- variables y bloques
- reglas de narrativa IA
Backlog principal: `CLARO-035`, `CLARO-031`.

### 11.3 Programacion y Envios
- frecuencia
- destinatarios por lista
- estado de entrega
- reintento manual
Backlog principal: `CLARO-035`, `CLARO-039`, `CLARO-042`.

## 12) Diccionario de KPI y formulas

### 12.1 Brand Health Score (BHS)
Composicion:
- reputacion: 50%
- alcance/volumen: 25%
- riesgo: 25%

Normalizacion:
- cada subscore en escala 0..100
- BHS final truncado a 0..100

### 12.2 Share of Voice (SOV)
Universo:
- Claro + competidores del set cerrado

Ponderacion por mencion:
- calidad_senal: 60%
- alcance_estimado: 40%

Alcance SOV:
- incluye conversacion externa + propia
- aplica filtro anti spam/bots antes de KPI oficial

### 12.3 Sentimiento neto
Formula:
- `%positivo - %negativo` sobre menciones validas

### 12.4 Riesgo activo
- score severidad compuesto en escala 0..100
- severidad:
  - SEV-1 >=80
  - SEV-2 60..79
  - SEV-3 <60

## 13) Modelo de calidad de senal

### 13.1 Spam/bot handling
- filtro automatico obligatorio para KPI oficial
- score de calidad por mencion
- exclusion de ruido de agregados

### 13.2 Falsos positivos
- marcado manual con reason code
- afecta recalibracion mensual

### 13.3 Loop mensual
- revisa umbrales, queries y filtros
- owner: inteligencia digital

## 14) Modelo de dedupe e identidad
- dedupe cross-source obligatorio
- identidad primaria: `source_post_id`
- fallback: URL/hash
- mantener referencia de todos los origenes detectados

## 15) Politicas de override semantico
- permitido a Admin/Analyst
- recalculo KPI inmediato
- motivo obligatorio solo si cambio impacta sentimiento negativo
- auditoria completa `before/after`

## 16) Narrativa IA y gobernanza de reportes

### 16.1 Narrativa automatica
- habilitada en V1
- guardrails obligatorios:
  - disclaimer IA
  - confianza
  - fuentes usadas

### 16.2 Umbral de confianza
- envio automatico permitido solo si `confianza >= 0.65`
- si `confianza < 0.65`:
  - estado `pending_review`
  - no envio automatico

### 16.3 Recomendaciones IA
- maximo 3 acciones concretas por reporte

### 16.4 Versionado
- versionado obligatorio de reportes emitidos

## 17) Seguridad, privacidad y exportes
- credenciales solo en Secrets Manager
- PII minimizada/enmascarada en UI
- CSV sanitizado por defecto
- limite export CSV: 100k filas
- export con PII completa: solo Admin
- comparticion externa de reportes: solo listas aprobadas Admin

## 18) Observabilidad de UX y producto
Eventos minimos:
- connector_sync_triggered
- connector_sync_failed
- kpi_threshold_breached
- incident_created
- incident_assigned
- incident_resolved
- report_generated
- report_pending_review
- false_positive_marked
- override_applied

## 19) Estados transversales de interfaz
Cada pantalla debe definir estados:
- loading
- empty
- partial_data
- stale_data
- permission_denied
- error_retriable
- error_non_retriable

## 20) Requisitos no funcionales (UX)
- Desktop-first responsive con soporte de consulta movil ligera
- Accesibilidad WCAG 2.1 AA
- Performance objetivo LCP < 2.5s en vistas principales
- Consistencia de timezone `America/Bogota` en UI/reportes

## 21) Criterios de aceptacion por modulo

### 21.1 Configuracion
- Admin puede gestionar 8 pantallas sin errores bloqueantes
- todo cambio sensible queda auditado

### 21.2 Monitoreo
- Overview carga KPIs oficiales en ventana 7d
- feed principal y feed competencia operan separados

### 21.3 Analisis
- 3 paginas disponibles con drill-down funcional
- benchmark competencia refleja set cerrado

### 21.4 Reportes
- plantillas, schedules y ejecuciones funcionales
- output Web + CSV
- narrativa bloqueada cuando confianza <0.65

## 22) Plan de release

### Sprint 1
- Configuracion + Monitoreo
- conectores, cuentas, competidores, query builder, overview, feeds

### Sprint 2
- Analisis + motor KPI + incidentes

### Sprint 3
- Reportes + hardening + readiness go-live

### Validacion final
- UAT: 2 semanas
- Piloto: 1 semana

## 23) Criterios de go-live
Release habilitado solo si se cumple todo:
1. 16 cuentas propias activas y validadas
2. set final de competidores aprobado
3. KPIs oficiales estables
4. reportes automaticos operativos (Web + CSV)
5. UAT/piloto completados sin bloqueantes criticos

## 24) Dependencias abiertas (previas a Sprint 3)
- carga real de catalogo de 16 cuentas
- carga final de competidores
- listas iniciales de destinatarios ejecutivos y operativos

## 25) Trazabilidad con backlog
Historias vinculadas:
- CLARO-031, CLARO-032, CLARO-033, CLARO-034, CLARO-035, CLARO-036, CLARO-037, CLARO-038, CLARO-039, CLARO-040, CLARO-041, CLARO-042

## 26) Definition of Ready y Definition of Done (Front)

### 26.1 Definition of Ready por historia front
Una historia front se considera lista para iniciar si cumple:
1. Existe referencia explicita en `BACKLOG.md` con `CLARO-xxx`.
2. Tiene secciones UX asociadas definidas en `2.1`.
3. Tiene contrato API disponible o mock pactado para pantalla afectada.
4. Tiene criterios de aceptacion del modulo (seccion 21).

### 26.2 Definition of Done por historia front
Una historia front se considera cerrada si cumple:
1. Implementacion funcional completa segun secciones UX asociadas.
2. Estados UI obligatorios cubiertos (`loading`, `empty`, `error`, etc.).
3. Eventos de observabilidad UX instrumentados cuando aplique.
4. Pruebas del modulo cubren los criterios de aceptacion de la seccion 21.
5. `BACKLOG.md` y `UX_PLANNING.md` actualizados en el mismo PR si hubo cambios de alcance.
6. Estado en `BACKLOG.md` actualizado (`doing`->`done`) con nota de salida verificable.

## 27) Secuencia de Arranque Front (ejecucion sugerida)
1. `CLARO-022` + `CLARO-031`:
   - levantar shell, auth y modulo Configuracion base.
2. `CLARO-037` + `CLARO-038`:
   - conectar fuentes y catalogos para alimentar configuracion real.
3. `CLARO-032` + `CLARO-023`:
   - habilitar Overview y feeds de monitoreo con datos reales.
4. `CLARO-033` + `CLARO-036`:
   - activar motor KPI y flujo de alertas/incidentes.
5. `CLARO-034`:
   - construir paginas de analisis con drill-down.
6. `CLARO-035` + `CLARO-039`:
   - cerrar reportes, exportes, guardrails de narrativa y gobernanza.
7. `CLARO-041` + `CLARO-042`:
   - onboarding, diccionario KPI, UAT/piloto y checklist final de go-live.

### 27.1 Salidas verificables por etapa
| Etapa | Historias | Salida minima verificable |
|---|---|---|
| 1 | CLARO-022 + CLARO-031 | shell con RBAC + 8 pantallas de configuracion navegables |
| 2 | CLARO-037 + CLARO-038 | conectores con health visible + catalogos base cargados |
| 3 | CLARO-032 + CLARO-023 | overview con KPIs oficiales + feeds separados claro/competencia |
| 4 | CLARO-033 + CLARO-036 | severidad activa + triage de incidentes con SLA visible |
| 5 | CLARO-034 | 3 paginas de analisis con drill-down funcional |
| 6 | CLARO-035 + CLARO-039 | centro de reportes + plantillas + schedules + export CSV gobernado |
| 7 | CLARO-041 + CLARO-042 | diccionario KPI + tour por rol + checklist go-live completo |
