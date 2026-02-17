import { useEffect, useMemo, useState } from "react";
import { useApiClient } from "../api/useApiClient";

const countByName = (items: Array<{ value: string; count: number }>, value: string): number =>
  items.find((item) => item.value === value)?.count ?? 0;

export const MonitorOverviewPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ value: string; count: number }>>([]);
  const [states, setStates] = useState<Array<{ value: string; count: number }>>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const meta = await client.getMeta();
        setProviders(meta.providers ?? []);
        setStates(meta.states ?? []);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const totalItems = useMemo(() => states.reduce((acc, item) => acc + item.count, 0), [states]);
  const activeItems = useMemo(() => countByName(states, "active"), [states]);
  const archivedItems = useMemo(() => countByName(states, "archived"), [states]);
  const hiddenItems = useMemo(() => countByName(states, "hidden"), [states]);

  return (
    <section>
      <header className="page-header">
        <h2>Overview de Monitoreo</h2>
        <p>Base de CLARO-032: estado operativo y volumen agregado para navegar hacia feeds Claro/competencia.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="kpi-grid">
        <article className="panel kpi-card">
          <h3>Total contenido</h3>
          <p className="kpi-value">{loading ? "..." : totalItems}</p>
        </article>
        <article className="panel kpi-card">
          <h3>Activos</h3>
          <p className="kpi-value">{loading ? "..." : activeItems}</p>
        </article>
        <article className="panel kpi-card">
          <h3>Archivados</h3>
          <p className="kpi-value">{loading ? "..." : archivedItems}</p>
        </article>
        <article className="panel kpi-card">
          <h3>Ocultos</h3>
          <p className="kpi-value">{loading ? "..." : hiddenItems}</p>
        </article>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Top proveedores</h3>
        </div>
        {loading ? <p>Cargando metadatos...</p> : null}
        {!loading && providers.length === 0 ? <p>Sin datos de proveedores por ahora.</p> : null}
        {!loading ? (
          <ul className="simple-list">
            {providers.slice(0, 8).map((provider) => (
              <li key={provider.value}>
                <span>{provider.value}</span>
                <strong>{provider.count}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
};
