import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, type ConfigQuery, type NewsFeedResponse, type OriginType, type TermScope } from "../api/client";
import { useApiClient } from "../api/useApiClient";

type MonitorFeedPageProps = {
  scope: TermScope;
  title: string;
  subtitle: string;
};

type FeedViewMode = "table" | "cards";

const PAGE_LIMIT = 20;
const VIEW_MODE_STORAGE_PREFIX = "monitor-feed:view-mode";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short"
});

const getViewModeStorageKey = (scope: TermScope) => `${VIEW_MODE_STORAGE_PREFIX}:${scope}`;

const readStoredViewMode = (scope: TermScope): FeedViewMode => {
  if (typeof window === "undefined") return "table";
  const stored = window.localStorage.getItem(getViewModeStorageKey(scope));
  return stored === "cards" ? "cards" : "table";
};

const extractDomain = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "dominio desconocido";
  }
};

const formatFeedDate = (item: NewsFeedResponse["items"][number]): { label: "Publicación" | "Detectado"; value: string } => {
  const rawValue = item.published_at ?? item.created_at;
  const parsed = new Date(rawValue);
  const fallback = rawValue ?? "n/a";
  return {
    label: item.published_at ? "Publicación" : "Detectado",
    value: Number.isNaN(parsed.getTime()) ? fallback : DATE_FORMATTER.format(parsed)
  };
};

const truncate = (value: string | null | undefined, max = 220): string => {
  const normalized = value?.trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
};

const normalizeToken = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

const shouldShowMediumChip = (item: NewsFeedResponse["items"][number]): boolean => {
  const medium = normalizeToken(item.medium);
  if (!medium) return false;

  const provider = normalizeToken(item.provider);
  const origin = normalizeToken(item.origin);
  return medium !== provider && medium !== origin;
};

export const MonitorFeedPage = ({ scope, title, subtitle }: MonitorFeedPageProps) => {
  const client = useApiClient();

  const [queries, setQueries] = useState<ConfigQuery[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  const [items, setItems] = useState<NewsFeedResponse["items"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginType | "all">("all");
  const [mediumFilter, setMediumFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [viewMode, setViewMode] = useState<FeedViewMode>(() => readStoredViewMode(scope));
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const selectedQuery = useMemo(
    () => queries.find((query) => query.id === selectedQueryId) ?? null,
    [queries, selectedQueryId]
  );

  const isSelectedQueryBlocked = selectedQuery?.awario_link_status !== "linked";

  const hasActiveFilters = originFilter !== "all" || mediumFilter.trim().length > 0 || tagFilter.trim().length > 0;

  useEffect(() => {
    setViewMode(readStoredViewMode(scope));
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getViewModeStorageKey(scope), viewMode);
  }, [scope, viewMode]);

  const loadFeed = async (options: { append: boolean }) => {
    if (!selectedQueryId) {
      setItems([]);
      setNextCursor(null);
      setHasNext(false);
      return;
    }

    const selected = queries.find((query) => query.id === selectedQueryId) ?? null;
    if (selected && selected.awario_link_status !== "linked") {
      setItems([]);
      setNextCursor(null);
      setHasNext(false);
      setExpandedRows({});
      return;
    }

    const cursor = options.append ? nextCursor ?? undefined : undefined;
    if (options.append && !cursor) return;

    if (options.append) {
      setLoadingMore(true);
    } else {
      setLoadingFeed(true);
    }
    setError(null);

    try {
      const response = await client.listNewsFeed(selectedQueryId, {
        limit: PAGE_LIMIT,
        cursor,
        origin: originFilter === "all" ? undefined : originFilter,
        medium: mediumFilter.trim() || undefined,
        tag: tagFilter.trim() || undefined
      });

      setItems((current) => (options.append ? [...current, ...(response.items ?? [])] : response.items ?? []));
      setNextCursor(response.page_info?.next_cursor ?? null);
      setHasNext(Boolean(response.page_info?.has_next));
      if (!options.append) {
        setExpandedRows({});
      }
    } catch (feedError) {
      if (feedError instanceof ApiError && feedError.status === 409) {
        setError("La query seleccionada está bloqueada: falta vínculo Awario activo.");
      } else {
        setError((feedError as Error).message);
      }
      if (!options.append) {
        setItems([]);
        setNextCursor(null);
        setHasNext(false);
        setExpandedRows({});
      }
    } finally {
      if (options.append) {
        setLoadingMore(false);
      } else {
        setLoadingFeed(false);
      }
    }
  };

  useEffect(() => {
    const loadQueries = async () => {
      setLoadingQueries(true);
      setError(null);
      try {
        const response = await client.listConfigQueries({
          limit: 200,
          scope,
          is_active: true
        });
        const activeQueries = (response.items ?? []).filter((query) => query.is_active && query.scope === scope);
        setQueries(activeQueries);
        setSelectedQueryId((current) => {
          if (current && activeQueries.some((query) => query.id === current)) return current;
          const linked = activeQueries.find((query) => query.awario_link_status === "linked");
          return linked?.id ?? activeQueries[0]?.id ?? "";
        });
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoadingQueries(false);
      }
    };

    void loadQueries();
  }, [client, scope]);

  useEffect(() => {
    void loadFeed({ append: false });
  }, [selectedQueryId, originFilter, mediumFilter, tagFilter]);

  const onToggleRow = (itemId: string) => {
    setExpandedRows((current) => ({ ...current, [itemId]: !current[itemId] }));
  };

  const resetFilters = () => {
    setOriginFilter("all");
    setMediumFilter("");
    setTagFilter("");
  };

  return (
    <section>
      <header className="page-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>

      {error ? (
        <div className="alert error monitor-feed-alert-row">
          <span>{error}</span>
          <button className="btn btn-outline" type="button" onClick={() => void loadFeed({ append: false })} disabled={!selectedQueryId || loadingFeed}>
            Reintentar
          </button>
        </div>
      ) : null}

      <section className="panel monitor-feed-toolbar">
        <div className="monitor-feed-toolbar-grid">
          <label>
            Query activa ({scope})
            <select
              value={selectedQueryId}
              onChange={(event) => setSelectedQueryId(event.target.value)}
              disabled={loadingQueries || queries.length === 0}
            >
              {queries.length === 0 ? <option value="">No hay queries activas para este scope</option> : null}
              {queries.map((query) => (
                <option key={query.id} value={query.id}>
                  {query.name} {query.awario_link_status === "linked" ? "" : "(bloqueada: falta Awario)"}
                </option>
              ))}
            </select>
          </label>

          <label>
            Origen
            <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as OriginType | "all")}> 
              <option value="all">all</option>
              <option value="news">news</option>
              <option value="awario">awario</option>
            </select>
          </label>

          <label>
            Medio
            <input
              value={mediumFilter}
              onChange={(event) => setMediumFilter(event.target.value)}
              placeholder="facebook, web, instagram, x"
            />
          </label>

          <label>
            Tag
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="origin:awario, medium:web"
            />
          </label>
        </div>

        <div className="monitor-feed-toolbar-actions">
          <div className="monitor-feed-view-toggle" role="tablist" aria-label="Modo de visualización del feed">
            <button
              className={`btn btn-outline ${viewMode === "table" ? "is-active" : ""}`}
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
            >
              Tabla
            </button>
            <button
              className={`btn btn-outline ${viewMode === "cards" ? "is-active" : ""}`}
              type="button"
              onClick={() => setViewMode("cards")}
              aria-pressed={viewMode === "cards"}
            >
              Cards
            </button>
          </div>

          <button className="btn btn-outline" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>
            Limpiar filtros
          </button>

          <button className="btn btn-outline" type="button" onClick={() => void loadFeed({ append: false })} disabled={!selectedQueryId || loadingFeed}>
            Refrescar
          </button>
        </div>
      </section>

      <section className="panel monitor-feed-meta">
        <span>
          Estado vínculo: {selectedQuery ? (isSelectedQueryBlocked ? "missing_awario" : `linked (${selectedQuery.awario_sync_state ?? "-"})`) : "-"}
        </span>
        <span>Resultados cargados: {items.length}</span>
        <span>Cursor: {nextCursor ? "sí" : "no"}</span>
      </section>

      {isSelectedQueryBlocked ? (
        <div className="alert warning monitor-feed-alert-row">
          <span>La query seleccionada está bloqueada hasta vincular una alerta Awario.</span>
          <Link className="btn btn-outline" to="/app/config/queries">
            Ir a Configuración de Queries
          </Link>
        </div>
      ) : null}

      {loadingFeed ? (
        <section className="panel monitor-feed-loading" aria-live="polite">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="monitor-feed-skeleton-row" key={`skeleton-${index}`} />
          ))}
        </section>
      ) : null}

      {!loadingFeed && !isSelectedQueryBlocked && selectedQuery && items.length === 0 ? (
        <div className="panel monitor-feed-empty">
          <p>{hasActiveFilters ? "No hay resultados con los filtros actuales." : "No hay resultados para la query seleccionada."}</p>
        </div>
      ) : null}

      {!loadingFeed && !isSelectedQueryBlocked && items.length > 0 && viewMode === "table" ? (
        <div className="panel monitor-feed-table-wrapper">
          <div className="monitor-feed-table-scroll">
            <table className="monitor-feed-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Titular</th>
                  <th>Origen</th>
                  <th>Medio</th>
                  <th>Fuente</th>
                  <th>Vínculo</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const date = formatFeedDate(item);
                  const domain = extractDomain(item.canonical_url);
                  const isExpanded = Boolean(expandedRows[item.id]);

                  return [
                    <tr key={`${item.id}-main`}>
                      <td>
                        <strong>{date.value}</strong>
                        <small>{date.label}</small>
                      </td>
                      <td>
                        <strong>{item.title}</strong>
                        <small>{domain}</small>
                      </td>
                      <td>
                        <span className={`origin-chip origin-chip-${item.origin}`}>{item.origin}</span>
                      </td>
                      <td>{item.medium ?? "-"}</td>
                      <td>{item.provider}</td>
                      <td>
                        <span className={`origin-chip ${isSelectedQueryBlocked ? "monitor-feed-chip-warning" : ""}`}>
                          {isSelectedQueryBlocked ? "missing_awario" : `linked:${selectedQuery?.awario_sync_state ?? "-"}`}
                        </span>
                      </td>
                      <td>
                        <div className="monitor-feed-table-actions">
                          <a href={item.canonical_url} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                          <button className="btn btn-outline" type="button" onClick={() => onToggleRow(item.id)}>
                            {isExpanded ? "Ocultar" : "Detalle"}
                          </button>
                        </div>
                      </td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`${item.id}-detail`} className="monitor-feed-detail-row">
                        <td colSpan={7}>
                          <p>{truncate(item.summary ?? item.content, 420) || "Sin resumen disponible."}</p>
                          <div className="origin-chip-row">
                            {item.tags.map((tag) => (
                              <span className="origin-chip" key={`${item.id}-${tag}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!loadingFeed && !isSelectedQueryBlocked && items.length > 0 && viewMode === "cards" ? (
        <div className="feed-grid monitor-feed-card-grid">
          {items.map((item) => {
            const date = formatFeedDate(item);
            const summaryText = truncate(item.summary ?? item.content, 220) || "Sin resumen disponible.";
            const domain = extractDomain(item.canonical_url);

            return (
              <article className="feed-card monitor-feed-card" key={item.id}>
                <div className="monitor-feed-card-meta-row">
                  <span className={`origin-chip origin-chip-${item.origin}`}>{item.origin}</span>
                  {shouldShowMediumChip(item) ? <span className="origin-chip">medio:{item.medium}</span> : null}
                  <span className="origin-chip">dominio:{domain}</span>
                </div>

                <h3>{item.title}</h3>
                <p className="feed-date">
                  {date.label}: {date.value}
                </p>
                <p>{summaryText}</p>

                <div className="monitor-feed-card-footer">
                  <span className="feed-provider">{item.provider}</span>
                  <a href={item.canonical_url} target="_blank" rel="noreferrer">
                    Abrir fuente
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!isSelectedQueryBlocked && hasNext ? (
        <div className="button-row" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" type="button" onClick={() => void loadFeed({ append: true })} disabled={loadingMore}>
            {loadingMore ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      ) : null}
    </section>
  );
};
