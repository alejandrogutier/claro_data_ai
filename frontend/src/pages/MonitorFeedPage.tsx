import { useEffect, useMemo, useState } from "react";
import { type NewsFeedResponse, type Term, type TermScope } from "../api/client";
import { useApiClient } from "../api/useApiClient";

type MonitorFeedPageProps = {
  scope: TermScope;
  title: string;
  subtitle: string;
};

export const MonitorFeedPage = ({ scope, title, subtitle }: MonitorFeedPageProps) => {
  const client = useApiClient();

  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [feed, setFeed] = useState<NewsFeedResponse | null>(null);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTerm = useMemo(() => terms.find((term) => term.id === selectedTermId) ?? null, [terms, selectedTermId]);

  useEffect(() => {
    const loadTerms = async () => {
      setLoadingTerms(true);
      setError(null);
      try {
        const response = await client.listTerms(100, undefined, scope);
        const activeTerms = (response.items ?? []).filter((term) => term.is_active);
        setTerms(activeTerms);
        setSelectedTermId((current) => {
          if (current && activeTerms.some((term) => term.id === current)) return current;
          return activeTerms[0]?.id ?? "";
        });
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoadingTerms(false);
      }
    };

    void loadTerms();
  }, [scope]);

  useEffect(() => {
    const loadFeed = async () => {
      if (!selectedTermId) {
        setFeed(null);
        return;
      }

      setLoadingFeed(true);
      setError(null);
      try {
        const response = await client.listNewsFeed(selectedTermId);
        setFeed(response);
      } catch (feedError) {
        setError((feedError as Error).message);
      } finally {
        setLoadingFeed(false);
      }
    };

    void loadFeed();
  }, [selectedTermId]);

  return (
    <section>
      <header className="page-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel feed-controls">
        <label>
          Query activa ({scope})
          <select
            value={selectedTermId}
            onChange={(event) => setSelectedTermId(event.target.value)}
            disabled={loadingTerms || terms.length === 0}
          >
            {terms.length === 0 ? <option value="">No hay queries activas para este scope</option> : null}
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn btn-outline"
          type="button"
          onClick={async () => {
            if (!selectedTermId) return;
            setLoadingFeed(true);
            try {
              const response = await client.listNewsFeed(selectedTermId);
              setFeed(response);
              setError(null);
            } catch (refreshError) {
              setError((refreshError as Error).message);
            } finally {
              setLoadingFeed(false);
            }
          }}
          disabled={!selectedTermId || loadingFeed}
        >
          Refrescar
        </button>
      </section>

      {loadingFeed ? <p>Cargando feed...</p> : null}

      {!loadingFeed && selectedTerm && feed && feed.items.length === 0 ? (
        <div className="panel">
          <p>No hay noticias recientes para la query seleccionada.</p>
        </div>
      ) : null}

      <div className="feed-grid">
        {(feed?.items ?? []).map((item) => (
          <article className="feed-card" key={item.id}>
            <p className="feed-provider">{item.provider}</p>
            <h3>{item.title}</h3>
            <p className="feed-date">{item.published_at ?? item.created_at}</p>
            <p>{item.summary ?? "Sin resumen disponible."}</p>
            <a href={item.canonical_url} target="_blank" rel="noreferrer">
              Abrir fuente
            </a>
          </article>
        ))}
      </div>
    </section>
  );
};
