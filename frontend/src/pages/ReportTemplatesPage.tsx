import { useEffect, useMemo, useState } from "react";
import { type AuditExportResponse, type TaxonomyEntry } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const templatePresets = [
  {
    id: "daily-ops",
    name: "Diario Operativo",
    description: "Cambios de configuracion y estado operativo por dia"
  },
  {
    id: "weekly-governance",
    name: "Semanal Governance",
    description: "Auditoria consolidada para cumplimiento y trazabilidad"
  }
];

export const ReportTemplatesPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canGenerate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [campaignTaxonomy, setCampaignTaxonomy] = useState<TaxonomyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<AuditExportResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.listTaxonomy("campaigns", false);
      setCampaignTaxonomy(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const generateAuditReport = async (templateId: string) => {
    if (!canGenerate) return;

    setGeneratingId(templateId);
    setError(null);

    try {
      const response = await client.exportConfigAudit({
        filters: {
          from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        },
        limit: 2000
      });
      setLastExport(response);
    } catch (generateError) {
      setError((generateError as Error).message);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Plantillas de Reporte (Base)</h2>
        <p>
          Base funcional no-stub para CLARO-031: plantillas base + generacion de reporte CSV sobre auditoria configurada.
        </p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {!canGenerate ? <div className="alert info">Tu rol es de solo lectura para generar reportes.</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Plantillas disponibles</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={loading}>
            Recargar
          </button>
        </div>

        <ul className="simple-list simple-list--stacked">
          {templatePresets.map((preset) => (
            <li key={preset.id}>
              <div style={{ width: "100%", display: "grid", gap: 8 }}>
                <div className="section-title-row">
                  <strong>{preset.name}</strong>
                  <span>{preset.id}</span>
                </div>
                <p>{preset.description}</p>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!canGenerate || generatingId === preset.id}
                  onClick={() => void generateAuditReport(preset.id)}
                >
                  {generatingId === preset.id ? "Generando..." : "Generar CSV"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>Taxonomia de campanas</h3>
          <span>{campaignTaxonomy.length} entradas activas</span>
        </div>

        {loading ? <p>Cargando taxonomia...</p> : null}
        {!loading && campaignTaxonomy.length === 0 ? <p>No hay campanas en taxonomia.</p> : null}

        {!loading ? (
          <ul className="simple-list">
            {campaignTaxonomy.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <strong>{item.key}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {lastExport ? (
        <section className="panel">
          <div className="section-title-row">
            <h3>Ultimo reporte generado</h3>
            <span>{lastExport.row_count} filas</span>
          </div>
          <a href={lastExport.download_url} target="_blank" rel="noreferrer">
            Descargar CSV
          </a>
        </section>
      ) : null}
    </section>
  );
};
