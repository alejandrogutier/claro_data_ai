import { useEffect, useMemo, useState } from "react";
import { ApiError, type ConfigQuery, type NewsFeedResponse, type OriginType } from "../api/client";
import { useApiClient } from "../api/useApiClient";

const PAGE_LIMIT = 20;

export const NewsFeedPage = () => {
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
  const [tagFilter, setTagFilter] = useState("");

  const selectedQuery = useMemo(
    () => queries.find((query) => query.id === selectedQueryId) ?? null,
    [queries, selectedQueryId]
  );

  const loadFeed = async (options: { append: boolean }) => {
    if (!selectedQueryId) {
      setItems([]);
      setNextCursor(null);
      setHasNext(false);
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
        tag: tagFilter.trim() || undefined
      });

      setItems((current) => (options.append ? [...current, ...(response.items ?? [])] : response.items ?? []));
      setNextCursor(response.page_info?.next_cursor ?? null);
      setHasNext(Boolean(response.page_info?.has_next));
    } catch (feedError) {
      if (feedError instanceof ApiError && feedError.status === 409) {
        setError("La query seleccionada no tiene vínculo Awario activo.");
      } else {
        setError((feedError as Error).message);
      }
      if (!options.append) {
        setItems([]);
        setNextCursor(null);
        setHasNext(false);
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
        const response = await client.listConfigQueries({ limit: 200, is_active: true });
        const activeQueries = (response.items ?? []).filter((query) => query.is_active);
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
  }, []);

  useEffect(() => {
    void loadFeed({ append: false });
  }, [selectedQueryId, originFilter, tagFilter]);

  return (
    <section>
      <header className="page-header">
        <h2>Feed de Noticias por Query</h2>
        <p>Feed unificado (news + awario) deduplicado por URL y paginado.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel feed-controls">
        <label>
          Query activa
          <select
            value={selectedQueryId}
            onChange={(event) => setSelectedQueryId(event.target.value)}
            disabled={loadingQueries || queries.length === 0}
          >
            {queries.length === 0 ? <option value="">No hay queries activas</option> : null}
            {queries.map((query) => (
              <option key={query.id} value={query.id}>
                {query.name} {query.awario_link_status === "linked" ? "" : "(bloqueada: falta Awario)"}
              </option>
            ))}
          </select>
        </label>

        <button className="btn btn-outline" type="button" onClick={() => void loadFeed({ append: false })} disabled={!selectedQueryId || loadingFeed}>
          Refrescar
        </button>
      </section>

      <section className="panel feed-controls">
        <label>
          Origen
          <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as OriginType | "all")}>
            <option value="all">all</option>
            <option value="news">news</option>
            <option value="awario">awario</option>
          </select>
        </label>
        <label>
          Tag
          <input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            placeholder="origin:news o provider:newsapi"
          />
        </label>
      </section>

      {selectedQuery && selectedQuery.awario_link_status !== "linked" ? (
        <div className="alert warning">La query seleccionada está bloqueada hasta vincular una alerta Awario.</div>
      ) : null}

      {loadingFeed ? <p>Cargando feed...</p> : null}

      {!loadingFeed && selectedQuery && items.length === 0 ? (
        <div className="panel">
          <p>No hay resultados para la query seleccionada.</p>
        </div>
      ) : null}

      <div className="feed-grid">
        {items.map((item) => (
          <article className="feed-card" key={item.id}>
            <p className="feed-provider">{item.provider}</p>
            <div className="origin-chip-row">
              <span className={`origin-chip origin-chip-${item.origin}`}>{item.origin}</span>
              {item.medium ? <span className="origin-chip">medio:{item.medium}</span> : null}
            </div>
            <h3>{item.title}</h3>
            <p className="feed-date">{item.published_at ?? item.created_at}</p>
            <p>{item.summary ?? "Sin resumen disponible."}</p>
            <a href={item.canonical_url} target="_blank" rel="noreferrer">
              Abrir fuente
            </a>
          </article>
        ))}
      </div>

      {hasNext ? (
        <div className="button-row" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" type="button" onClick={() => void loadFeed({ append: true })} disabled={loadingMore}>
            {loadingMore ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      ) : null}
    </section>
  );
};
