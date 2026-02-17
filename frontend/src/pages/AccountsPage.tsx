import { useEffect, useMemo, useState } from "react";
import { ApiError, type OwnedAccount } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

type AccountForm = {
  platform: string;
  handle: string;
  accountName: string;
  businessLine: string;
  macroRegion: string;
  language: string;
  teamOwner: string;
  status: string;
  campaignTags: string;
};

const defaultForm: AccountForm = {
  platform: "x",
  handle: "",
  accountName: "",
  businessLine: "",
  macroRegion: "",
  language: "es",
  teamOwner: "",
  status: "active",
  campaignTags: ""
};

const parseTags = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);

export const AccountsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<OwnedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(defaultForm);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConfigAccounts(250);
      setItems(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await client.createConfigAccount({
        platform: form.platform.trim().toLowerCase(),
        handle: form.handle.trim(),
        account_name: form.accountName.trim(),
        business_line: form.businessLine.trim() || undefined,
        macro_region: form.macroRegion.trim() || undefined,
        language: form.language.trim().toLowerCase(),
        team_owner: form.teamOwner.trim() || undefined,
        status: form.status.trim().toLowerCase(),
        campaign_tags: parseTags(form.campaignTags)
      });

      setItems((current) => [created, ...current]);
      setForm(defaultForm);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(`No se pudo crear la cuenta: ${createError.message}`);
      } else {
        setError((createError as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (account: OwnedAccount) => {
    if (!canMutate) return;
    setError(null);
    try {
      const updated = await client.patchConfigAccount(account.id, {
        status: account.estado === "active" ? "inactive" : "active"
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h2>Cuentas Propias</h2>
        <p>Operacion CLARO-038: catalogo operativo de cuentas oficiales de Claro.</p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {!canMutate ? <div className="alert info">Solo Admin puede crear/editar cuentas.</div> : null}

      {canMutate ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <label>
            Plataforma
            <input
              type="text"
              value={form.platform}
              onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}
              required
            />
          </label>

          <label>
            Handle
            <input
              type="text"
              value={form.handle}
              onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value }))}
              required
            />
          </label>

          <label>
            Nombre de cuenta
            <input
              type="text"
              value={form.accountName}
              onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
              required
            />
          </label>

          <label>
            Linea de negocio
            <input
              type="text"
              value={form.businessLine}
              onChange={(event) => setForm((current) => ({ ...current, businessLine: event.target.value }))}
            />
          </label>

          <label>
            Region macro
            <input
              type="text"
              value={form.macroRegion}
              onChange={(event) => setForm((current) => ({ ...current, macroRegion: event.target.value }))}
            />
          </label>

          <label>
            Idioma
            <input
              type="text"
              value={form.language}
              onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
              required
            />
          </label>

          <label>
            Owner equipo
            <input
              type="text"
              value={form.teamOwner}
              onChange={(event) => setForm((current) => ({ ...current, teamOwner: event.target.value }))}
            />
          </label>

          <label>
            Estado
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <label>
            Tags campana (coma)
            <input
              type="text"
              value={form.campaignTags}
              onChange={(event) => setForm((current) => ({ ...current, campaignTags: event.target.value }))}
              placeholder="hogar,prepago,q1"
            />
          </label>

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Crear cuenta"}
          </button>
        </form>
      ) : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Listado</h3>
          <button className="btn btn-outline" type="button" onClick={() => void loadAccounts()} disabled={loading}>
            Recargar
          </button>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {!loading && items.length === 0 ? <p>No hay cuentas registradas.</p> : null}

        {!loading ? (
          <ul className="simple-list simple-list--stacked">
            {items.map((account) => (
              <li key={account.id}>
                <div style={{ width: "100%", display: "grid", gap: 8 }}>
                  <div className="section-title-row">
                    <strong>
                      {account.nombre_cuenta} ({account.plataforma})
                    </strong>
                    <span>{account.handle}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>estado: {account.estado}</span>
                    <span>linea: {account.linea_negocio ?? "n/a"}</span>
                    <span>region: {account.region_macro ?? "n/a"}</span>
                    <span>tags: {account.tags_campana.join(", ") || "n/a"}</span>
                  </div>

                  {canMutate ? (
                    <button className="btn btn-outline" type="button" onClick={() => void toggleStatus(account)}>
                      {account.estado === "active" ? "Desactivar" : "Activar"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
};
