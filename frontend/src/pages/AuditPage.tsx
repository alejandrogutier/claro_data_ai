import { useEffect, useMemo, useState } from "react";
import { ApiError, type AuditExportResponse, type AuditItem } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type AuditFiltersForm = {
  resourceType: string;
  action: string;
  actorUserId: string;
  from: string;
  to: string;
};

const defaultFilters: AuditFiltersForm = {
  resourceType: "",
  action: "",
  actorUserId: "",
  from: "",
  to: ""
};

export const AuditPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canExport = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [filters, setFilters] = useState<AuditFiltersForm>(defaultFilters);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<AuditExportResponse | null>(null);

  const loadAudit = async (nextCursor?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.listConfigAudit({
        limit: 80,
        cursor: nextCursor,
        resource_type: filters.resourceType || undefined,
        action: filters.action || undefined,
        actor_user_id: filters.actorUserId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined
      });

      setItems(response.items ?? []);
      setCursor(response.page_info.next_cursor ?? null);
      setHasNext(response.page_info.has_next ?? false);
    } catch (loadError) {
      setError((loadError as Error).message);
      setItems([]);
      setCursor(null);
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, []);

  const onApplyFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    await loadAudit();
  };

  const onExport = async () => {
    if (!canExport) return;

    setExporting(true);
    setError(null);
    setExportResult(null);

    try {
      const response = await client.exportConfigAudit({
        filters: {
          resource_type: filters.resourceType || undefined,
          action: filters.action || undefined,
          actor_user_id: filters.actorUserId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined
        },
        limit: 2000
      });
      setExportResult(response);
    } catch (exportError) {
      if (exportError instanceof ApiError) {
        setError(`No se pudo exportar auditoria: ${exportError.message}`);
      } else {
        setError((exportError as Error).message);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Auditoria de Configuracion</h2>
        <p>Operacion CLARO-039: trazabilidad de cambios con filtros y export CSV sanitizado por rol.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {!canExport ? <div className="alert info">Tu rol es de solo lectura para export de auditoria.</div> : null}

      <form className="panel form-grid" onSubmit={onApplyFilters}>
        <label>
          resource_type
          <input
            type="text"
            value={filters.resourceType}
            onChange={(event) => setFilters((current) => ({ ...current, resourceType: event.target.value }))}
            placeholder="OwnedAccount"
          />
        </label>

        <label>
          action
          <input
            type="text"
            value={filters.action}
            onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
            placeholder="owned_account_updated"
          />
        </label>

        <label>
          actor_user_id
          <input
            type="text"
            value={filters.actorUserId}
            onChange={(event) => setFilters((current) => ({ ...current, actorUserId: event.target.value }))}
            placeholder="uuid"
          />
        </label>

        <label>
          from
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
          />
        </label>

        <label>
          to
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          Aplicar filtros
        </button>

        <button className="btn btn-outline" type="button" onClick={() => void loadAudit()} disabled={loading}>
          Limpiar
        </button>

        <button className="btn btn-outline" type="button" onClick={onExport} disabled={!canExport || exporting}>
          {exporting ? "Exportando..." : "Exportar CSV"}
        </button>
      </form>

      {exportResult ? (
        <section className="panel">
          <div className="section-title-row">
            <h3>Export generado</h3>
            <span>{exportResult.row_count} filas</span>
          </div>
          <p>Descarga temporal:</p>
          <a href={exportResult.download_url} target="_blank" rel="noreferrer">
            Abrir CSV
          </a>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Eventos</h3>
          {hasNext ? (
            <button className="btn btn-outline" type="button" onClick={() => void loadAudit(cursor ?? undefined)} disabled={loading}>
              Siguiente pagina
            </button>
          ) : null}
        </div>

        {loading ? <p>Cargando eventos...</p> : null}
        {!loading && items.length === 0 ? <p>No hay eventos de auditoria para los filtros actuales.</p> : null}

        {!loading ? (
          <ul className="simple-list simple-list--stacked">
            {items.map((item) => (
              <li key={item.id}>
                <div style={{ width: "100%", display: "grid", gap: 8 }}>
                  <div className="section-title-row">
                    <strong>{item.action}</strong>
                    <span>{item.created_at}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>resource: {item.resource_type}</span>
                    <span>id: {item.resource_id ?? "n/a"}</span>
                    <span>actor: {item.actor_email ?? item.actor_user_id ?? "redacted"}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
};
